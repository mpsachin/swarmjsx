import * as Cesium from 'cesium';

/**
 * Interface detailing explicit Radar Cross-Section (RCS) characteristics for a UAV.
 */
interface RadarCrossSection {
    baseRcsSqm: number;         // Base Radar Cross-Section in square meters (e.g., 0.1 m² for stealthy/small UAV)
    seaSkimmingRcsSqm: number;  // Reduced effective RCS when flying ultra-low due to multipath clutter propagation effects
}

/**
 * Interface configuring asset links for 3D glTF Models.
 */
interface AssetRegistry {
    aircraftCarrierUrl: string;
    destroyerUrl: string;
    uavUrl: string;
}

/**
 * Configuration schema for the Task Group and Drone Swarm engagement parameters.
 */
interface ScenarioConfig {
    assets: AssetRegistry;
    rcsConfig: RadarCrossSection;
    radarPeakPowerKw: number;   // Radar power performance metric influencing dynamic detection ranges
    samRangeMeters: number;     // Outer tactical Surface-to-Air Missile range limit
    ciwsRangeMeters: number;    // Inner terminal Close-In Weapon System range limit
}

export class CesiumSwarmSimulation {
    private viewer: Cesium.Viewer;
    private config: ScenarioConfig;
    private fleetCenter: Cesium.Cartographic;
    
    // Entity Tracking Pools
    private combatants: Cesium.Entity[] = [];
    private radars: Cesium.Entity[] = [];
    private activeEngagements: Set<string> = new Set();
    private eventListeners: (() => void)[] = [];

    constructor(viewer: Cesium.Viewer, configOverrides?: Partial<ScenarioConfig>) {
        this.viewer = viewer;
        
        // Setup industry-standard default parameters emphasizing explicit RCS calculations
        this.config = {
            assets: {
                aircraftCarrierUrl: 'https://assets.cesium.com/models/carrier.glb',
                destroyerUrl: 'https://assets.cesium.com/models/destroyer.glb',
                uavUrl: 'https://assets.cesium.com/models/uav.glb',
                ...configOverrides?.assets
            },
            rcsConfig: {
                baseRcsSqm: 0.15,          // 0.15 square meters typical structural signature profile
                seaSkimmingRcsSqm: 0.02,   // Degraded visibility under 30m altitude due to sea clutter/multipath
                ...configOverrides?.rcsConfig
            },
            radarPeakPowerKw: 4500,        // High-power naval phased array baseline performance
            samRangeMeters: 40000,         // 40km outer area defense boundary
            ciwsRangeMeters: 4500,         // 4.5km inner point defense perimeter
            ...configOverrides
        };

        // Center deployment over North Sea operational zone
        this.fleetCenter = Cesium.Cartographic.fromDegrees(4.5000, 54.0000, 0);
        this.initializeSimulation();
    }

    /**
     * Initializes the scenario assets, defensive sensor envelopes, and tracking update hooks.
     */
    private initializeSimulation(): void {
        this.configureEnvironment();
        const shipEntities = this.deployTaskGroup();
        this.deploySwarmWaves(shipEntities[0]); // Target the Aircraft Carrier capital asset
        this.attachTrackingEngine(shipEntities);
    }

    /**
     * Adjusts the core clock and simulation timelines.
     */
    private configureEnvironment(): void {
        const startTime = Cesium.JulianDate.fromDate(new Date());
        this.viewer.clock.startTime = startTime.clone();
        this.viewer.clock.currentTime = startTime.clone();
        this.viewer.clock.stopTime = Cesium.JulianDate.addSeconds(startTime, 600, new Cesium.JulianDate());
        this.viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
        this.viewer.clock.multiplier = 1.0;
        this.viewer.clock.shouldAnimate = true;
    }

    /**
     * Spawns naval platforms and computes their dynamic baseline detection perimeters.
     */
    private deployTaskGroup(): Cesium.Entity[] {
        const ships: Cesium.Entity[] = [];
        const carrierPos = Cesium.Cartesian3.fromRadians(this.fleetCenter.longitude, this.fleetCenter.latitude, 0);

        // 1. High Value Unit - Aircraft Carrier (CVN)
        const carrier = this.viewer.entities.add({
            name: "CVN Task Group Capital Asset",
            position: carrierPos,
            model: {
                uri: this.config.assets.aircraftCarrierUrl,
                minimumPixelSize: 120,
                maximumScale: 1.0
            }
        });
        ships.push(carrier);

        // 2. Destroyer Screening Escorts (DDG) with explicit radar profiles
        const offsets = [
            { lon: 0.04, lat: 0.02, label: "DDG Screening Escort Alpha" },
            { lon: -0.04, lat: 0.02, label: "DDG Screening Escort Bravo" },
            { lon: 0.00, lat: -0.04, label: "DDG Screen Rear Guard" }
        ];

        offsets.forEach((offset) => {
            const shipPos = Cesium.Cartesian3.fromRadians(
                this.fleetCenter.longitude + offset.lon,
                this.fleetCenter.latitude + offset.lat,
                0
            );

            const destroyer = this.viewer.entities.add({
                name: offset.label,
                position: shipPos,
                model: {
                    uri: this.config.assets.destroyerUrl,
                    minimumPixelSize: 90,
                    maximumScale: 1.0
                }
            });
            ships.push(destroyer);

            // Visualize fixed structural weapon system envelopes (CIWS)
            this.viewer.entities.add({
                position: shipPos,
                name: `${offset.label} CIWS Inner Envelope`,
                ellipse: {
                    semiMajorAxis: this.config.ciwsRangeMeters,
                    semiMinorAxis: this.config.ciwsRangeMeters,
                    material: new Cesium.ColorMaterialProperty(Cesium.Color.RED.withAlpha(0.08)),
                    outline: true,
                    outlineColor: Cesium.Color.RED,
                    height: 10
                }
            });
        });

        return ships;
    }

    /**
     * Deploys structured threat waves containing distinct RCS properties.
     */
    private deploySwarmWaves(target: Cesium.Entity): void {
        const waves = [
            { name: "Alpha Wave (High-Altitude Ingress)", bearingDeg: 0, count: 4, initialAlt: 1500, timeOffset: 0 },
            { name: "Bravo Wave (Low-Altitude Sea-Skim)", bearingDeg: 120, count: 5, initialAlt: 300, timeOffset: 30 },
            { name: "Gamma Wave (Asymmetric Split Profile)", bearingDeg: 240, count: 4, initialAlt: 800, timeOffset: 60 }
        ];

        const targetPos = target.position?.getValue(this.viewer.clock.currentTime);
        if (!targetPos) return;
        const targetCart = Cesium.Cartographic.fromCartesian(targetPos);

        waves.forEach((wave) => {
            for (let i = 0; i < wave.count; i++) {
                const spreadAngle = (wave.bearingDeg + (i - (wave.count - 1) / 2) * 12) * (Math.PI / 180);
                const startDistance = 0.8; // Radians offset (~50km out)
                
                const startLon = targetCart.longitude + startDistance * Math.sin(spreadAngle);
                const startLat = targetCart.latitude + startDistance * Math.cos(spreadAngle);

                const property = new Cesium.SampledPositionProperty();
                const totalDuration = 400; // Total strike seconds
                const startTime = Cesium.JulianDate.addSeconds(this.viewer.clock.startTime, wave.timeOffset, new Cesium.JulianDate());

                // Build path iterations mapping the dive profile transition to low altitude
                for (let step = 0; step <= 10; step++) {
                    const fraction = step / 10;
                    const intermediateTime = Cesium.JulianDate.addSeconds(startTime, fraction * totalDuration, new Cesium.JulianDate());
                    
                    const currentLon = Cesium.Math.lerp(startLon, targetCart.longitude, fraction);
                    const currentLat = Cesium.Math.lerp(startLat, targetCart.latitude, fraction);
                    
                    // Sea-skimming profile logic transitions altitude downwards dramatically as it nears target
                    let currentAlt = Cesium.Math.lerp(wave.initialAlt, 15, fraction * fraction); 
                    if (fraction > 0.75) {
                        currentAlt = 12; // Maintain ultra-low terminal profile (12 meters above water level)
                    }

                    const point = Cesium.Cartesian3.fromRadians(currentLon, currentLat, currentAlt);
                    property.addSample(intermediateTime, point);
                }

                // Append the dynamic threat asset into runtime tracker arrays
                const uav = this.viewer.entities.add({
                    name: `${wave.name} - Unit ${i + 1}`,
                    position: property,
                    model: {
                        uri: this.config.assets.uavUrl,
                        minimumPixelSize: 30,
                        maximumScale: 1.0
                    },
                    polyline: {
                        positions: new Cesium.PositionPropertyArray([
                            new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromRadians(startLon, startLat, wave.initialAlt)),
                            property
                        ]),
                        width: 1.5,
                        material: Cesium.Color.YELLOW.withAlpha(0.4)
                    }
                });

                this.combatants.push(uav);
            }
        });
    }

    /**
     * Dynamic Math Core: Tracks every frame update, calculates current RCS, 
     * applies the Radar Range Equation, and determines sensor detection state.
     */
    private attachTrackingEngine(defenders: Cesium.Entity[]): void {
        const onTickCallback = () => {
            const currentTime = this.viewer.clock.currentTime;

            // Iterate through every active drone threat
            for (let i = this.combatants.length - 1; i >= 0; i--) {
                const uav = this.combatants[i];
                const uavPos = uav.position?.getValue(currentTime);
                if (!uavPos) continue;

                const uavCartographic = Cesium.Cartographic.fromCartesian(uavPos);
                const currentAltitude = uavCartographic.height;

                // 1. DYNAMIC RCS CALCULATION
                // Determine RCS based on flight altitude signature changes (Multipath sea-clutter propagation effects)
                const currentRcs = (currentAltitude <= 30) 
                    ? this.config.rcsConfig.seaSkimmingRcsSqm 
                    : this.config.rcsConfig.baseRcsSqm;

                // 2. RADAR RANGE EQUATION INVERSION
                // Max Range scales directly with fourth root of the effective RCS ( R = C * (RCS ^ 0.25) )
                const baselineDetectionFactor = Math.pow(this.config.radarPeakPowerKw / 4500, 0.25);
                const dynamicDetectionRadius = this.config.samRangeMeters * Math.pow(currentRcs / 0.15, 0.25) * baselineDetectionFactor;

                let isDetectedByTaskGroup = false;
                let closestDefender: Cesium.Entity | null = null;
                let shortestDistance = Infinity;

                // Process sensor tracking arrays relative to fleet elements
                defenders.forEach((defender) => {
                    const defPos = defender.position?.getValue(currentTime);
                    if (!defPos) return;

                    const range = Cesium.Cartesian3.distance(uavPos, defPos);
                    if (range < shortestDistance) {
                        shortestDistance = range;
                        closestDefender = defender;
                    }

                    // Flag true if threat falls inside the dynamic calculated detection bubble
                    if (range <= dynamicDetectionRadius) {
                        isDetectedByTaskGroup = true;
                    }
                });

                if (!closestDefender) continue;

                // 3. MULTI-LAYERED WEAPON INTERCEPTION LOGIC
                if (isDetectedByTaskGroup) {
                    // Update threat visual tracks to denote radar lock status
                    if (uav.model) {
                        (uav.model as any).color = Cesium.Color.RED;
                    }

                    // Layer A: Terminal Close-In Weapon System (CIWS) Envelope (Interior Shield)
                    if (shortestDistance <= this.config.ciwsRangeMeters) {
                        this.firePointDefenses(closestDefender, uav, currentTime);
                        this.destroyThreat(uav, i, "CIWS Kinetic Destruction Event");
                        continue;
                    }

                    // Layer B: Outer Surface-to-Air Missile (SAM) Envelope engagement check
                    if (shortestDistance <= this.config.samRangeMeters && !this.activeEngagements.has(uav.id)) {
                        this.launchSurfaceToAirMissile(closestDefender, uav, currentTime);
                    }
                } else {
                    // Threat hidden by low altitude sea-skimming RCS profile / radar horizon mask
                    if (uav.model) {
                        (uav.model as any).color = Cesium.Color.LIGHTGRAY; // Low signature stealth state
                    }
                }

                // 4. TERMINAL STRIKE CHECK (Impact on Task Group Core)
                if (shortestDistance <= 50) {
                    this.triggerDetonationCascade(uavPos);
                    this.destroyThreat(uav, i, "Target Impact / Hull Penetration");
                }
            }
        };

        this.viewer.clock.onTick.addEventListener(onTickCallback);
        this.eventListeners.push(() => this.viewer.clock.onTick.removeEventListener(onTickCallback));
    }

    /**
     * Renders high-frequency visual tracer tracks representing rapid fire terminal armor deployment.
     */
    private firePointDefenses(source: Cesium.Entity, target: Cesium.Entity, time: Cesium.JulianDate): void {
        const tracer = this.viewer.entities.add({
            name: "CIWS 20mm Tracer Spray",
            polyline: {
                positions: new Cesium.PositionPropertyArray([
                    new Cesium.ConstantPositionProperty(source.position?.getValue(time)),
                    new Cesium.ConstantPositionProperty(target.position?.getValue(time))
                ]),
                width: 4.0,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.3,
                    taperPower: 0.1,
                    color: Cesium.Color.ORANGE
                })
            }
        });
        
        // Scrub tracer line entity swiftly from viewport after brief display window
        setTimeout(() => this.viewer.entities.remove(tracer), 450);
    }

    /**
     * Spawns an interceptor missile tracking the specified threat path.
     */
    private launchSurfaceToAirMissile(source: Cesium.Entity, target: Cesium.Entity, startTime: Cesium.JulianDate): void {
        this.activeEngagements.add(target.id);
        const missileProperty = new Cesium.SampledPositionProperty();
        
        // Generate an accelerated flight interception curve path over 4 seconds
        for (let t = 0; t <= 4; t++) {
            const evalTime = Cesium.JulianDate.addSeconds(startTime, t, new Cesium.JulianDate());
            const sourcePos = source.position?.getValue(evalTime) || source.position?.getValue(startTime);
            const targetPos = target.position?.getValue(evalTime) || target.position?.getValue(startTime);
            
            if (sourcePos && targetPos) {
                const stepPos = Cesium.Cartesian3.lerp(sourcePos, targetPos, t / 4, new Cesium.Cartesian3());
                missileProperty.addSample(evalTime, stepPos);
            }
        }

        const missile = this.viewer.entities.add({
            name: "RIM-162 ESSM Interceptor",
            position: missileProperty,
            polyline: {
                positions: missileProperty,
                width: 3.0,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.2,
                    color: Cesium.Color.CYAN
                })
            }
        });

        setTimeout(() => this.viewer.entities.remove(missile), 4000);
    }

    /**
     * Triggers dynamic explosion geometry upon successful intercept or impact.
     */
    private triggerDetonationCascade(position: Cesium.Cartesian3): void {
        const explosion = this.viewer.entities.add({
            position: position,
            name: "Kinetic Detonation Blast",
            ellipse: {
                semiMajorAxis: 200,
                semiMinorAxis: 200,
                material: new Cesium.ColorMaterialProperty(Cesium.Color.YELLOW.withAlpha(0.6)),
                height: 15
            }
        });
        setTimeout(() => this.viewer.entities.remove(explosion), 800);
    }

    /**
     * Cleans up internal collection data pools to safeguard rendering performance.
     */
    private destroyThreat(uav: Cesium.Entity, index: number, logReason: string): void {
        console.log(`[Simulation Log] Threat Neutralized: ${uav.name} via ${logReason}`);
        this.viewer.entities.remove(uav);
        this.combatants.splice(index, 1);
        this.activeEngagements.delete(uav.id);
    }

    /**
     * Public cleanup handler ensuring clean resource teardown cycles across active views.
     */
    public destroy(): void {
        this.eventListeners.forEach(remove => remove());
        this.eventListeners = [];
        this.combatants.forEach(entity => this.viewer.entities.remove(entity));
        this.radars.forEach(entity => this.viewer.entities.remove(entity));
        this.combatants = [];
        this.radars = [];
        this.activeEngagements.clear();
    }
}
