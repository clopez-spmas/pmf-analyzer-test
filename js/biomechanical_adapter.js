"use strict";

/*
=========================================================
BIOMECHANICAL ADAPTER
OCRA Video Analyzer
=========================================================

Convierte frames de Kinovea en frames anatómicos.

NO calcula ángulos.

Trabaja con un mapping independiente para cada vídeo.
=========================================================
*/


/* =====================================================
   ADAPTAR FRAMES DE KINOVEA
   ===================================================== */

function adaptKinoveaFrames(
    frames,
    mapping
) {

    /*
    -----------------------------------------------------
    VALIDAR FRAMES
    -----------------------------------------------------
    */

    if (!Array.isArray(frames)) {

        throw new Error(
            "No existen frames Kinovea"
        );

    }


    /*
    -----------------------------------------------------
    VALIDAR MAPPING
    -----------------------------------------------------
    */

    if (
        !mapping ||
        typeof mapping !== "object"
    ) {

        throw new Error(
            "No existe marker mapping"
        );

    }


    /*
    -----------------------------------------------------
    RESULTADO
    -----------------------------------------------------
    */

    var adaptedFrames = [];


    /*
    -----------------------------------------------------
    PROCESAR CADA FRAME
    -----------------------------------------------------
    */

    frames.forEach(
        function (
            frame,
            framePosition
        ) {

            var anatomicalLandmarks = {};


            /*
            ---------------------------------------------
            RECORRER MAPPING
            ---------------------------------------------
            */

            Object.entries(
                mapping
            ).forEach(
                function (entry) {

                    var anatomicalPoint =
                        entry[0];

                    var markerName =
                        entry[1];


                    /*
                    -------------------------------------
                    SIN MARCADOR ASIGNADO
                    -------------------------------------
                    */

                    if (
                        !markerName ||
                        String(
                            markerName
                        ).trim() === ""
                    ) {

                        return;

                    }


                    /*
                    -------------------------------------
                    BUSCAR MARCADOR EN EL FRAME
                    -------------------------------------
                    */

                    var point = null;


                    if (
                        frame &&
                        frame.landmarks &&
                        frame.landmarks[markerName]
                    ) {

                        point =
                            frame.landmarks[markerName];

                    }


                    /*
                    -------------------------------------
                    COMPROBAR COORDENADAS
                    -------------------------------------
                    */

                    if (
                        point &&
                        typeof point.x === "number" &&
                        typeof point.y === "number"
                    ) {

                        /*
                        Crear copia independiente.
                        */

                        anatomicalLandmarks[
                            anatomicalPoint
                        ] = {

                            x: point.x,
                            y: point.y

                        };

                    }
                    else {

                        /*
                        El marcador está asignado,
                        pero no está disponible
                        en este frame.
                        */

                        anatomicalLandmarks[
                            anatomicalPoint
                        ] = null;

                    }

                }
            );


            /*
            -------------------------------------------------
            ÍNDICE DEL FRAME
            -------------------------------------------------
            */

            var frameIndex =
                framePosition;


            if (
                frame &&
                frame.index !== undefined &&
                frame.index !== null &&
                isFinite(
                    Number(
                        frame.index
                    )
                )
            ) {

                frameIndex =
                    Number(
                        frame.index
                    );

            }


            /*
            -------------------------------------------------
            TIEMPO DEL FRAME
            -------------------------------------------------
            */

            var frameTime = 0;


            if (
                frame &&
                frame.time !== undefined &&
                frame.time !== null &&
                isFinite(
                    Number(
                        frame.time
                    )
                )
            ) {

                frameTime =
                    Number(
                        frame.time
                    );

            }


            /*
            -------------------------------------------------
            CREAR FRAME ANATÓMICO
            -------------------------------------------------
            */

            adaptedFrames.push({

                index:
                    frameIndex,

                time:
                    frameTime,

                landmarks:
                    anatomicalLandmarks

            });

        }
    );


    /*
    -----------------------------------------------------
    DEVOLVER
    -----------------------------------------------------
    */

    return adaptedFrames;

}


/* =====================================================
   MOSTRAR MAPPING
   ===================================================== */

function printMappingStatus(
    mapping
) {

    console.log(
        "================================================="
    );

    console.log(
        "MAPA ANATÓMICO ACTUAL"
    );

    console.log(
        "================================================="
    );


    if (
        !mapping ||
        typeof mapping !== "object"
    ) {

        console.warn(
            "No existe mapping."
        );

        return;

    }


    Object.entries(
        mapping
    ).forEach(
        function (entry) {

            var anatomicalPoint =
                entry[0];

            var markerName =
                entry[1];


            /*
            IMPORTANTE:

            No utilizamos template literals.

            Esto evita el error:
            Unexpected identifier '$'
            */

            console.log(
                anatomicalPoint +
                " <- " +
                (
                    markerName ||
                    "(sin asignar)"
                )
            );

        }
    );


    console.log(
        "================================================="
    );

}


/* =====================================================
   OBTENER PUNTOS ANATÓMICOS MAPEADOS
   ===================================================== */

function getMappedAnatomicalPoints(
    mapping
) {

    if (
        !mapping ||
        typeof mapping !== "object"
    ) {

        return [];

    }


    return Object.entries(
        mapping
    )
    .filter(
        function (entry) {

            var marker =
                entry[1];

            return (
                marker !== null &&
                marker !== undefined &&
                String(
                    marker
                ).trim() !== ""
            );

        }
    )
    .map(
        function (entry) {

            return entry[0];

        }
    );

}


/* =====================================================
   COMPROBAR PUNTO ANATÓMICO
   ===================================================== */

function isAnatomicalPointMapped(
    mapping,
    anatomicalPoint
) {

    if (
        !mapping ||
        !anatomicalPoint
    ) {

        return false;

    }


    var marker =
        mapping[
            anatomicalPoint
        ];


    return (
        marker !== null &&
        marker !== undefined &&
        String(
            marker
        ).trim() !== ""
    );

}


/* =====================================================
   CONTAR PUNTOS MAPEADOS
   ===================================================== */

function countMappedAnatomicalPoints(
    mapping
) {

    return getMappedAnatomicalPoints(
        mapping
    ).length;

}


/* =====================================================
   EXPORTACIÓN GLOBAL
   ===================================================== */

window.adaptKinoveaFrames =
    adaptKinoveaFrames;

window.printMappingStatus =
    printMappingStatus;

window.getMappedAnatomicalPoints =
    getMappedAnatomicalPoints;

window.isAnatomicalPointMapped =
    isAnatomicalPointMapped;

window.countMappedAnatomicalPoints =
    countMappedAnatomicalPoints;


/* =====================================================
   CONFIRMACIÓN
   ===================================================== */

console.log(
    "OCRA Video Analyzer: biomechanical_adapter.js cargado correctamente"
);

console.log(
    "adaptKinoveaFrames disponible:",
    typeof window.adaptKinoveaFrames
);