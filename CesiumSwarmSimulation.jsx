import * as Cesium from 'cesium';

/**
 * Interface representing a dynamic entity in the simulation.
 */
interface SimulationEntity {
  id: string;
  entity: Cesium.Entity;
  update(time: Cesium.JulianDate): void;
}

/**
 * Configuration for the UAV Swarm and Ship Task Group simulation.
 */
const SIM_CONFIG = {
  // Center location: Mediterranean Sea
  centerLon: 15.0,
  centerLat: 35.0,
  
  // Fleet configuration
  ships: [
    { id: 'carrier', name: 'Aircraft Carrier', offsetLon: 0.0, offsetLat: 0.0, type: 'carrier' },
    { id: 'destroyer_1', name: 'DDG Destroyer Alpha', offsetLon: -0.05, offsetLat: 0.03, type: 'destroyer' },
    { id: 'destroyer_2', name: 'DDG Destroyer Bravo', offsetLon: 0.05, offsetLat: 0.03, type: 'destroyer' },
    { id: 'cruiser', name: 'CG Cruiser Alpha', offsetLon: 0.0, offsetLat: -0.04, type: 'cruiser' }
  ],
  
  // UAV Swarm configuration
  swarmSize: 12,
  uavSpeedRange: { min: 80, max: 120 }, // meters per second
  spawnRadius: 0.2, // Degrees distance from center for entry point
  spawnBearing: 45 // Approach angle from Northeast
};

/**
 * Class managing a Ship entity within the task group.
 */
class ShipEntity implements SimulationEntity {
  public id: string;
  public entity: Cesium.Entity;
  private basePosition: Cesium.Cartesian3;
  private heading: number = 270; // Moving West

  constructor(viewer: Cesium.Viewer, config: typeof SIM_CONFIG.ships[0]) {
    this.id = config.id;
    
    const lon = SIM_CONFIG.centerLon + config.offsetLon;
    const lat = SIM_CONFIG.centerLat + config.offsetLat;
    this.basePosition = Cesium.Cartesian3.fromDegrees(lon, lat, 0);

    // Create Cesium Entity
    this.entity = viewer.entities.add({
      id: this.id,
      name: config.name,
      position: new Cesium.CallbackProperty((time) => this.getPosition(time), false),
      orientation: new Cesium.CallbackProperty((time) => this.getOrientation(time), false),
      box: {
        dimensions: this.getDimensions(config.type),
        material: Cesium.Color.LIGHTGRAY,
        outline: true,
        outlineColor: Cesium.Color.BLACK
      },
      label: {
        text: config.name,
        font: '14px sans-serif',
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
  }

  private getDimensions(type: string): Cesium.Cartesian3 {
    switch (type) {
      case 'carrier': return new Cesium.Cartesian3(40, 300, 50); // Width, Length, Height
      case 'cruiser': return new Cesium.Cartesian3(20, 180, 30);
      default: return new Cesium.Cartesian3(18, 150, 25); // Destroyer
    }
  }

  public getPosition(time: Cesium.JulianDate): Cesium.Cartesian3 {
    // Ships slowly cruise forward forward over time (approx 10 m/s West)
    const seconds = Cesium.JulianDate.secondsDifference(time, Cesium.JulianDate.now());
    const distanceMoved = seconds * 10; 
    
    // Convert basePosition back to cartographic to shift it
    const cartographic = Cesium.Cartographic.fromCartesian(this.basePosition);
    const metersPerDegreeLon = 111320 * Math.cos(cartographic.latitude);
    
    const newLon = cartographic.longitude + ((-distanceMoved / metersPerDegreeLon) * (Math.PI / 180));
    return Cesium.Cartesian3.fromRadians(newLon, cartographic.latitude, 0);
  }

  public getOrientation(time: Cesium.JulianDate): Cesium.Quaternion {
    const position = this.getPosition(time);
    const headingRad = Cesium.Math.toRadians(this.heading);
    const hpr = new Cesium.HeadingPitchRoll(headingRad, 0, 0);
    return Cesium.Transforms.headingPitchRollQuaternion(position, hpr);
  }

  public update(time: Cesium.JulianDate): void {
    // Dynamic behavior logic if handling individual ship maneuvers
  }
}

/**
 * Class managing a Fixed-Wing UAV in the swarm executing an attack profile.
 */
class UavEntity implements SimulationEntity {
  public id: string;
  public entity: Cesium.Entity;
  
  private speed: number;
  private spawnPosition: Cesium.Cartographic;
  private targetShip: ShipEntity;
  private startTime: Cesium.JulianDate;
  
  constructor(viewer: Cesium.Viewer, id: string, target: ShipEntity, index: number) {
    this.id = id;
    this.targetShip = target;
    this.startTime = Cesium.JulianDate.now();
    
    // Diversify speeds slightly within the swarm
    this.speed = SIM_CONFIG.uavSpeedRange.min + Math.random() * (SIM_CONFIG.uavSpeedRange.max - SIM_CONFIG.uavSpeedRange.min);
    
    // Spread out spawn positions around a northeast approach sector
    const spreadAngle = Cesium.Math.toRadians(SIM_CONFIG.spawnBearing + (index - SIM_CONFIG.swarmSize / 2) * 4);
    const radDist = SIM_CONFIG.spawnRadius + (Math.random() * 0.05);
    
    const spawnLon = SIM_CONFIG.centerLon + Math.cos(spreadAngle) * radDist;
    const spawnLat = SIM_CONFIG.centerLat + Math.sin(spreadAngle) * radDist;
    const spawnAlt = 1500 + (Math.random() * 300); // 1.5km - 1.8km ingress altitude
    
    this.spawnPosition = Cesium.Cartographic.fromDegrees(spawnLon, spawnLat, spawnAlt);

    // Create Cesium Entity with a point and a trail lead line
    this.entity = viewer.entities.add({
      id: this.id,
      name: `UAV Swarm Unit ${id.split('_')[1]}`,
      position: new Cesium.CallbackProperty((time) => this.getPosition(time), false),
      orientation: new Cesium.CallbackProperty((time) => this.getOrientation(time), false),
      point: {
        pixelSize: 8,
        color: Cesium.Color.RED,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2
      },
      path: {
        resolution: 1,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.1,
          color: Cesium.Color.RED
        }),
        width: 3,
        leadTime: 0,
        trailTime: 15
      }
    });
  }

  public getPosition(time: Cesium.JulianDate): Cesium.Cartesian3 {
    const elapsedSeconds = Cesium.JulianDate.secondsDifference(time, this.startTime);
    if (elapsedSeconds < 0) {
      return Cesium.Cartesian3.fromRadians(this.spawnPosition.longitude, this.spawnPosition.latitude, this.spawnPosition.height);
    }

    const startCartesian = Cesium.Cartesian3.fromRadians(this.spawnPosition.longitude, this.spawnPosition.latitude, this.spawnPosition.height);
    const targetCartesian = this.targetShip.getPosition(time);
    
    // Total geometric distance from spawn to current target position
    const totalDistance = Cesium.Cartesian3.distance(startCartesian, targetCartesian);
    const distanceTraveled = this.speed * elapsedSeconds;

    // Terminal phase handling (Impact / Interception)
    if (distanceTraveled >= totalDistance) {
      return targetCartesian;
    }

    // Interpolate progress along the path
    const lerpFactor = distanceTraveled / totalDistance;
    const currentPos = Cesium.Cartesian3.lerp(startCartesian, targetCartesian, lerpFactor, new Cesium.Cartesian3());
    
    // Add an operational dive profile: high-altitude ingress transitioning to low-altitude sea-skimming cruise
    const cartoCurrent = Cesium.Cartographic.fromCartesian(currentPos);
    let dynamicAltitude = this.spawnPosition.height;
    
    // Dive profile between 30% and 70% of transit journey
    if (lerpFactor > 0.3 && lerpFactor <= 0.7) {
      const diveFactor = (lerpFactor - 0.3) / 0.4;
      dynamicAltitude = Cesium.Math.lerp(this.spawnPosition.height, 15, diveFactor); // Dive down to 15m sea-skimming
    } else if (lerpFactor > 0.7) {
      dynamicAltitude = 15; // Sea skimming altitude during final strike phase
    }

    return Cesium.Cartesian3.fromRadians(cartoCurrent.longitude, cartoCurrent.latitude, dynamicAltitude);
  }

  public getOrientation(time: Cesium.JulianDate): Cesium.Quaternion {
    const currentPos = this.getPosition(time);
    
    // Sample position slightly ahead to calculate real velocity vector orientation
    const futureTime = Cesium.JulianDate.addSeconds(time, 0.1, new Cesium.JulianDate());
    const futurePos = this.getPosition(futureTime);
    
    const velocityVector = Cesium.Cartesian3.subtract(futurePos, currentPos, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(velocityVector, velocityVector);
    
    // Generate orientation aligned with flight direction vector
    const headingPitchRoll = Cesium.Transforms.headingPitchRollQuaternion(currentPos, new Cesium.HeadingPitchRoll(
      Math.atan2(velocityVector.y, velocityVector.x), 
      Math.asin(velocityVector.z), 
      0
    ));
    
    return headingPitchRoll || Cesium.Quaternion.IDENTITY;
  }

  public update(time: Cesium.JulianDate): void {
    // Logic expansion block for evasion updates or defensive interception tags
  }
}

/**
 * Main Controller orchestrating the entire scenario simulation environment.
 */
export class SwarmSimulationController {
  private viewer: Cesium.Viewer;
  private ships: ShipEntity[] = [];
  private uavs: UavEntity[] = [];
  private isActive: boolean = false;

  constructor(containerId: string) {
    // Initializing standard 3D Globe Viewer
    this.viewer = new Cesium.Viewer(containerId, {
      terrainProvider: Cesium.createWorldTerrainAsync ? undefined : new Cesium.EllipsoidTerrainProvider(),
      animation: true,
      timeline: true,
      shouldAnimate: true
    });

    this.initializeScenario();
  }

  private initializeScenario(): void {
    // 1. Establish Environment Time Settings
    const start = Cesium.JulianDate.now();
    const stop = Cesium.JulianDate.addSeconds(start, 300, new Cesium.JulianDate()); // 5 minute timeline
    
    this.viewer.clock.startTime = start.clone();
    this.viewer.clock.stopTime = stop.clone();
    this.viewer.clock.currentTime = start.clone();
    this.viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
    this.viewer.clock.multiplier = 2; // Accelerated pacing

    // 2. Instantiate Maritime Surface Fleet
    SIM_CONFIG.ships.forEach(shipConfig => {
      this.ships.push(new ShipEntity(this.viewer, shipConfig));
    });

    // 3. Coordinate Swarm Attack Routing Assignment
    for (let i = 0; i < SIM_CONFIG.swarmSize; i++) {
      // Allocate targets across the fleet group evenly, prioritizing the High Value Asset (Carrier)
      let targetShip = this.ships[0]; // Carrier default
      if (i >= 4) {
        targetShip = this.ships[1 + (i % (this.ships.length - 1))]; // Spread across escort destroyers/cruiser
      }
      
      this.uavs.push(new UavEntity(this.viewer, `uav_${i}`, targetShip, i));
    }

    // 4. Focus Camera onto Scenario Focus Area
    const centerPoint = Cesium.Cartesian3.fromDegrees(SIM_CONFIG.centerLon, SIM_CONFIG.centerLat, 12000);
    this.viewer.camera.setView({
      destination: centerPoint,
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-60),
        roll: 0
      }
    });

    // Bind framework tick runtime handler hook
    this.viewer.clock.onTick.addEventListener((clock) => this.onTickUpdate(clock));
    this.isActive = true;
  }

  private onTickUpdate(clock: Cesium.Clock): void {
    if (!this.isActive) return;
    const currentTime = clock.currentTime;

    // Execute standard dynamic entity state update evaluations
    this.ships.forEach(ship => ship.update(currentTime));
    this.uavs.forEach(uav => uav.update(currentTime));
  }

  /**
   * Component teardown utility method
   */
  public destroy(): void {
    this.isActive = false;
    this.viewer.destroy();
  }
}
