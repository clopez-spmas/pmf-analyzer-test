"use strict";

/*
=========================================================
OCRA VIDEO ANALYZER
Archivo: biomechanics.js

Responsabilidades:

- Recorrer frames Kinovea/anatómicos.
- Obtener puntos anatómicos.
- Resolver puntos virtuales.
- Calcular ángulos biomecánicos.
- Admitir mediciones de 2 puntos y de 3 puntos.
- Generar únicamente mediciones que puedan calcularse
  con los puntos realmente disponibles en cada frame.

NO realiza:

- clasificación de riesgo
- puntuación OCRA
- interpretación ergonómica
=========================================================
*/


/* =========================================================
   OBTENER PUNTO ANATÓMICO
   ========================================================= */

function getPoint(
    frame,
    name
) {

    if (!frame || !name) {
        return null;
    }

    /*
    ---------------------------------------------------------
    PRIMERA FUENTE: frame.landmarks

    Los frames creados por biomechanical_adapter.js contienen
    únicamente los puntos anatómicos que pertenecen al mapping
    del vídeo actual. Esta fuente debe tener prioridad.

    Es fundamental para evitar que un vídeo utilice por error
    el mapping del vídeo 1.
    ---------------------------------------------------------
    */

    if (
        frame.landmarks &&
        Object.prototype.hasOwnProperty.call(
            frame.landmarks,
            name
        )
    ) {

        const point =
            frame.landmarks[name];

        if (
            point &&
            typeof point.x === "number" &&
            typeof point.y === "number" &&
            Number.isFinite(point.x) &&
            Number.isFinite(point.y)
        ) {
            return point;
        }

        return null;
    }

    /*
    ---------------------------------------------------------
    COMPATIBILIDAD

    Si el frame no contiene todavía landmarks anatómicos,
    se permite utilizar getJointPosition(). Esto mantiene
    compatibilidad con frames antiguos o llamadas externas.
    ---------------------------------------------------------
    */

    if (
        typeof getJointPosition === "function"
    ) {

        const point =
            getJointPosition(
                frame,
                name
            );

        if (
            point &&
            typeof point.x === "number" &&
            typeof point.y === "number"
        ) {
            return point;
        }
    }

    return null;
}


/* =========================================================
   COMPROBAR DISPONIBILIDAD DE UN PUNTO
   ========================================================= */

function hasPoint(
    frame,
    name
) {

    return Boolean(
        getPoint(
            frame,
            name
        )
    );
}


/* =========================================================
   PUNTOS VIRTUALES

   Se respetan las definiciones del catálogo:

   V_HIP_CENTER       = centro de ambas caderas
   V_SHOULDER_CENTER  = centro de ambos hombros
   V_HEAD_CENTER      = centro de cabeza anterior/posterior
   V_NECK_BASE        = punto neck_base

   Estos puntos nunca se asignan directamente a marcadores.
   ========================================================= */

function getVirtualPoint(
    frame,
    name
) {

    if (!frame) {
        return null;
    }

    /*
    ---------------------------------------------------------
    CENTRO DE PELVIS
    ---------------------------------------------------------
    */

    if (name === "V_HIP_CENTER") {

        const left =
            getPoint(
                frame,
                "left_hip"
            );

        const right =
            getPoint(
                frame,
                "right_hip"
            );

        if (!left || !right) {
            return null;
        }

        return {
            x: (left.x + right.x) / 2,
            y: (left.y + right.y) / 2,
            z: (
                (left.z || 0) +
                (right.z || 0)
            ) / 2
        };
    }

    /*
    ---------------------------------------------------------
    CENTRO DE HOMBROS
    ---------------------------------------------------------
    */

    if (name === "V_SHOULDER_CENTER") {

        const left =
            getPoint(
                frame,
                "left_shoulder"
            );

        const right =
            getPoint(
                frame,
                "right_shoulder"
            );

        if (!left || !right) {
            return null;
        }

        return {
            x: (left.x + right.x) / 2,
            y: (left.y + right.y) / 2,
            z: (
                (left.z || 0) +
                (right.z || 0)
            ) / 2
        };
    }

    /*
    ---------------------------------------------------------
    CENTRO DE CABEZA

    El catálogo define este punto a partir de head_front
    y head_back. No se utiliza nose como sustituto porque
    nose no forma parte de los 24 puntos anatómicos reales.
    ---------------------------------------------------------
    */

    if (name === "V_HEAD_CENTER") {

        const front =
            getPoint(
                frame,
                "head_front"
            );

        const back =
            getPoint(
                frame,
                "head_back"
            );

        if (!front || !back) {
            return null;
        }

        return {
            x: (front.x + back.x) / 2,
            y: (front.y + back.y) / 2,
            z: (
                (front.z || 0) +
                (back.z || 0)
            ) / 2
        };
    }

    /*
    ---------------------------------------------------------
    BASE DEL CUELLO

    El catálogo define V_NECK_BASE a partir de neck_base.
    ---------------------------------------------------------
    */

    if (name === "V_NECK_BASE") {

        return getPoint(
            frame,
            "neck_base"
        );
    }

    return null;
}


/* =========================================================
   COMPROBAR PUNTO REAL O VIRTUAL
   ========================================================= */

function hasResolvablePoint(
    frame,
    name
) {

    if (!frame || !name) {
        return false;
    }

    if (hasPoint(frame, name)) {
        return true;
    }

    return Boolean(
        getVirtualPoint(
            frame,
            name
        )
    );
}


/* =========================================================
   RESOLVER ALIAS DEL CATÁLOGO
   ========================================================= */

function resolvePointName(
    name
) {

    if (name === "pelvis") {
        return "V_HIP_CENTER";
    }

    if (name === "shoulder_center") {
        return "V_SHOULDER_CENTER";
    }

    if (name === "neck") {
        return "V_NECK_BASE";
    }

    return name;
}


/* =========================================================
   CALCULAR ÁNGULO A-B-C
   ========================================================= */

function calculateAngle(
    a,
    b,
    c
) {

    if (!a || !b || !c) {

        return {
            value: null,
            valid: false,
            reason: "landmarks_missing"
        };
    }

    if (typeof Geometry === "undefined") {

        return {
            value: null,
            valid: false,
            reason: "geometry_missing"
        };
    }

    if (
        typeof Geometry.angleAtPoint !==
        "function"
    ) {

        return {
            value: null,
            valid: false,
            reason: "geometry_angle_missing"
        };
    }

    return Geometry.angleAtPoint(
        a,
        b,
        c
    );
}


/* =========================================================
   CALCULAR ORIENTACIÓN DE SEGMENTO

   0°  = segmento vertical
   90° = segmento horizontal

   El cálculo se realiza en el plano 2D de la imagen.
   ========================================================= */

function calculateSegmentAngle(
    a,
    b
) {

    if (!a || !b) {

        return {
            value: null,
            valid: false,
            reason: "landmarks_missing"
        };
    }

    if (
        typeof a.x !== "number" ||
        typeof a.y !== "number" ||
        typeof b.x !== "number" ||
        typeof b.y !== "number" ||
        !Number.isFinite(a.x) ||
        !Number.isFinite(a.y) ||
        !Number.isFinite(b.x) ||
        !Number.isFinite(b.y)
    ) {

        return {
            value: null,
            valid: false,
            reason: "invalid_coordinates"
        };
    }

    const dx = b.x - a.x;
    const dy = -(b.y - a.y);

    const length =
        Math.sqrt(
            (dx * dx) +
            (dy * dy)
        );

    if (length === 0) {

        return {
            value: null,
            valid: false,
            reason: "zero_length_segment"
        };
    }

    let angle =
        Math.atan2(
            Math.abs(dx),
            Math.abs(dy)
        ) *
        180 /
        Math.PI;

    angle =
        Math.max(
            0,
            Math.min(
                90,
                angle
            )
        );

    return {
        value: angle,
        valid: true,
        reason: null
    };
}


/* =========================================================
   CALCULAR MEDICIÓN
   ========================================================= */

function calculateMeasurement(
    frame,
    definition
) {

    if (!definition) {

        return {
            value: null,
            valid: false,
            reason: "invalid_definition"
        };
    }

    const landmarks =
        definition.points;

    if (!Array.isArray(landmarks)) {

        return {
            value: null,
            valid: false,
            reason: "invalid_definition"
        };
    }

    const pointNames =
        landmarks.map(
            resolvePointName
        );

    /*
    ---------------------------------------------------------
    Antes de calcular, comprobar que todos los puntos
    necesarios existen realmente en este frame.

    Esto evita generar filas con null para estructuras que
    el usuario no ha marcado en el vídeo.
    ---------------------------------------------------------
    */

    for (const pointName of pointNames) {

        if (
            !hasResolvablePoint(
                frame,
                pointName
            )
        ) {

            return {
                value: null,
                valid: false,
                reason: "landmarks_missing"
            };
        }
    }

    if (pointNames.length === 2) {

        const a =
            getPoint(
                frame,
                pointNames[0]
            ) ||
            getVirtualPoint(
                frame,
                pointNames[0]
            );

        const b =
            getPoint(
                frame,
                pointNames[1]
            ) ||
            getVirtualPoint(
                frame,
                pointNames[1]
            );

        return calculateSegmentAngle(
            a,
            b
        );
    }

    if (pointNames.length === 3) {

        const a =
            getPoint(
                frame,
                pointNames[0]
            ) ||
            getVirtualPoint(
                frame,
                pointNames[0]
            );

        const b =
            getPoint(
                frame,
                pointNames[1]
            ) ||
            getVirtualPoint(
                frame,
                pointNames[1]
            );

        const c =
            getPoint(
                frame,
                pointNames[2]
            ) ||
            getVirtualPoint(
                frame,
                pointNames[2]
            );

        return calculateAngle(
            a,
            b,
            c
        );
    }

    return {
        value: null,
        valid: false,
        reason: "unsupported_point_count"
    };
}


/* =========================================================
   ANALIZAR UN FRAME
   ========================================================= */

function analyzeBiomechanicalFrame(
    frame
) {

    const results = [];

    if (!frame) {
        return results;
    }

    if (
        typeof BiomechanicalCatalog ===
        "undefined"
    ) {

        console.error(
            "BiomechanicalCatalog no está disponible."
        );

        return results;
    }

    Object.entries(
        BiomechanicalCatalog
    ).forEach(
        ([id, definition]) => {

            const result =
                calculateMeasurement(
                    frame,
                    definition
                );

            /*
            Solo guardar mediciones válidas.

            Si el vídeo no tiene los marcadores necesarios para
            una estructura, esa estructura no aparece en los
            resultados de ese frame.
            */

            if (!result || !result.valid) {
                return;
            }

            results.push({
                name: id,
                description:
                    definition.name,
                value:
                    result.value,
                unit:
                    definition.unit || "deg",
                frame_index:
                    frame.index ?? null,
                timestamp:
                    frame.time ?? null,
                valid: true,
                reason: null
            });
        }
    );

    return results;
}


/* =========================================================
   ANALIZAR TODOS LOS FRAMES
   ========================================================= */

function analyzeBiomechanics(
    frames
) {

    const measurements = [];

    if (!Array.isArray(frames)) {
        return measurements;
    }

    frames.forEach(
        frame => {

            measurements.push(
                ...analyzeBiomechanicalFrame(
                    frame
                )
            );
        }
    );

    return measurements;
}


/* =========================================================
   EXPORTACIÓN GLOBAL PARA NAVEGADOR
   ========================================================= */

window.Biomechanics = {
    getPoint,
    hasPoint,
    getVirtualPoint,
    hasResolvablePoint,
    resolvePointName,
    calculateAngle,
    calculateSegmentAngle,
    calculateMeasurement,
    analyzeBiomechanicalFrame,
    analyzeBiomechanics
};


/* =========================================================
   COMPATIBILIDAD GLOBAL
   ========================================================= */

window.getPoint =
    getPoint;

window.hasPoint =
    hasPoint;

window.getVirtualPoint =
    getVirtualPoint;

window.hasResolvablePoint =
    hasResolvablePoint;

window.resolvePointName =
    resolvePointName;

window.calculateAngle =
    calculateAngle;

window.calculateSegmentAngle =
    calculateSegmentAngle;

window.calculateMeasurement =
    calculateMeasurement;

window.analyzeBiomechanicalFrame =
    analyzeBiomechanicalFrame;

window.analyzeBiomechanics =
    analyzeBiomechanics;


console.log(
    "OCRA Video Analyzer: biomechanics.js cargado correctamente"
);
