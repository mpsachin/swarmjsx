import React, { useEffect, useRef } from "react";
import {
  Viewer,
  Cartesian3,
  Color,
  Entity,
  HeadingPitchRoll,
  Math as CesiumMath,
  Transforms,
  VerticalOrigin,
  LabelStyle,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

/**
 * UAV Swarm / Maritime Visualization Demo
 *
 * This component is intentionally limited to non-operational visualization:
 * - Displays a notional naval task group.
 * - Displays quadcopter UAVs as simulated tracks.
 * - Animates UAVs around the group for training/simulation visualization.
 * - Does NOT implement attack logic, weapon guidance, targeting, collision
 *   optimization, autonomous engagement, or real-world control.
 *
 * Save as: UAVSwarmVisualization.jsx
 */

const UAV_COUNT = 12;
const UPDATE_MS = 100;

function createShip(viewer, id, position, color = Color.DARK_GRAY) {
  return viewer.entities.add({
    id,
    position,
    point: {
      pixelSize: 14,
      color,
      outlineColor: Color.WHITE,
      outlineWidth: 2,
    },
    label: {
      text: id,
      font: "13px sans-serif",
      fillColor: Color.WHITE,
      style: LabelStyle.FILL,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian3(0, -16, 0),
    },
  });
}

function createUav(viewer, id, position) {
  return viewer.entities.add({
    id,
    position,
    point: {
      pixelSize: 9,
      color: Color.CYAN,
      outlineColor: Color.WHITE,
      outlineWidth: 1,
    },
    label: {
      text: id,
      font: "11px sans-serif",
      fillColor: Color.CYAN,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian3(0, -12, 0),
    },
  });
}

function localOffset(origin, eastMeters, northMeters, heightMeters = 0) {
  // Approximate local ENU offset for a visualization demo.
  const lat = origin.latitude;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * Math.cos(lat);

  return Cartesian3.fromDegrees(
    origin.longitude + eastMeters / metersPerDegreeLon,
    origin.latitude + northMeters / metersPerDegreeLat,
    origin.height + heightMeters
  );
}

export default function UAVSwarmVisualization() {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new Viewer(containerRef.current, {
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: true,
      sceneModePicker: false,
      navigationHelpButton: false,
      baseLayerPicker: true,
      infoBox: false,
      selectionIndicator: false,
    });

    viewerRef.current = viewer;

    // Notional maritime task group center.
    const center = {
      longitude: 72.0,
      latitude: 15.0,
      height: 0,
    };

    // Visual-only task group. Names are generic to avoid representing
    // a real-world targeting scenario.
    createShip(
      viewer,
      "Task-Group-Center",
      Cartesian3.fromDegrees(center.longitude, center.latitude, center.height),
      Color.ORANGE
    );

    createShip(
      viewer,
      "Escort-A",
      localOffset(
        center,
        900,
        500,
        0
      ),
      Color.YELLOW
    );

    createShip(
      viewer,
      "Escort-B",
      localOffset(
        center,
        -900,
        -500,
        0
      ),
      Color.YELLOW
    );

    createShip(
      viewer,
      "Escort-C",
      localOffset(
        center,
        -1100,
        650,
        0
      ),
      Color.YELLOW
    );

    // Create a ring of simulated UAVs.
    const uavs = [];

    for (let i = 0; i < UAV_COUNT; i++) {
      const angle = (2 * Math.PI * i) / UAV_COUNT;
      const radius = 4000 + (i % 3) * 500;

      const position = localOffset(
        center,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        300 + (i % 4) * 75
      );

      const entity = createUav(
        viewer,
        `UAV-${String(i + 1).padStart(2, "0")}`,
        position
      );

      uavs.push({
        entity,
        phase: angle,
        radius,
        altitude: 300 + (i % 4) * 75,
        speed: 0.0008 + (i % 4) * 0.00012,
      });
    }

    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        center.longitude,
        center.latitude,
        18000
      ),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-70),
        roll: 0,
      },
    });

    // Visualization animation only:
    // UAVs continuously orbit the notional group. There is no engagement
    // behavior, weapon logic, target selection, or attack execution.
    const timer = window.setInterval(() => {
      const now = performance.now();

      uavs.forEach((uav) => {
        const t = now * uav.speed * 0.001;
        const angle = uav.phase + t;

        const east = Math.cos(angle) * uav.radius;
        const north = Math.sin(angle) * uav.radius;

        // Small altitude variation gives the display a swarm-like appearance.
        const height =
          uav.altitude + Math.sin(angle * 2.0 + uav.phase) * 40;

        uav.entity.position = localOffset(
          center,
          east,
          north,
          height
        );
      });
    }, UPDATE_MS);

    return () => {
      window.clearInterval(timer);

      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }

      viewerRef.current = null;
    };
  }, []);

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 10,
          padding: "12px 16px",
          background: "rgba(0,0,0,0.72)",
          color: "white",
          borderRadius: 8,
          fontFamily: "Arial, sans-serif",
          fontSize: 14,
          lineHeight: 1.5,
          maxWidth: 330,
        }}
      >
        <strong>UAV Swarm Visualization</strong>
        <br />
        Notional maritime training scenario
        <br />
        {UAV_COUNT} simulated quadcopters
        <br />
        <span style={{ color: "#7ffcff" }}>
          Cyan: UAV swarm
        </span>
        <br />
        <span style={{ color: "#ffd54f" }}>
          Yellow: escort vessels
        </span>
        <br />
        <span style={{ color: "#ff9800" }}>
          Orange: task-group center
        </span>
      </div>
    </div>
  );
}
