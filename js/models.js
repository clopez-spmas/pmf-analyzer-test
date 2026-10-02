
"use strict";

/* ==========================================================
   OCRA VIDEO ANALYZER
   MODELOS DE DATOS
   ==========================================================

   IMPORTANTE:
   Este archivo NO utiliza import/export.

   Se carga directamente mediante:

       <script src="js/models.js"></script>

   Todos los modelos que necesitan ser utilizados por otros
   archivos se exponen mediante window.
   ========================================================== */


/* ==========================================================
   ACTION
   ========================================================== */

class Action {

    constructor(data = {}) {

        /* Identificación */

        this.id =
            data.id ??
            (
                typeof crypto !== "undefined" &&
                typeof crypto.randomUUID === "function"
                    ? crypto.randomUUID()
                    : String(Date.now()) +
                      "-" +
                      Math.random()
                          .toString(36)
                          .substring(2)
            );

        this.created =
            data.created ??
            Date.now();


        /* ==================================================
           LOCALIZACIÓN
           ================================================== */

        this.side =
            data.side ??
            "right";

        this.hand =
            data.hand ??
            this.side;

        this.finger =
            data.finger ??
            null;


        /* ==================================================
           VÍDEO
           ================================================== */

        this.frame =
            data.frame ??
            0;

        this.time =
            data.time ??
            0;

        this.duration =
            data.duration ??
            0;

        this.cycle =
            data.cycle ??
            1;

        this.phase =
            data.phase ??
            "";


        /* ==================================================
           ACCIÓN
           ================================================== */

        this.type =
            data.type ??
            "technical";

        this.classification =
            data.classification ??
            "";

        this.description =
            data.description ??
            "";


        /* ==================================================
           FACTORES OCRA
           ================================================== */

        this.force =
            data.force ??
            0;

        this.posture =
            data.posture ??
            0;

        this.recovery =
            data.recovery ??
            0;

        this.frequency =
            data.frequency ??
            0;

        this.riskFactor =
            data.riskFactor ??
            0;


        /* ==================================================
           ÁNGULOS ARTICULARES
           ================================================== */


        /* --------------------------------------------------
           HOMBROS
           -------------------------------------------------- */

        this.shoulder = {

            right:
                data.shoulder?.right ??
                null,

            left:
                data.shoulder?.left ??
                null

        };


        /* --------------------------------------------------
           CODOS
           -------------------------------------------------- */

        this.elbow = {

            right:
                data.elbow?.right ??
                null,

            left:
                data.elbow?.left ??
                null

        };


        /* --------------------------------------------------
           MUÑECAS
           -------------------------------------------------- */

        this.wrist = {

            right:
                data.wrist?.right ??
                null,

            left:
                data.wrist?.left ??
                null

        };


        /* --------------------------------------------------
           RODILLAS
           -------------------------------------------------- */

        this.knee = {

            right:
                data.knee?.right ??
                null,

            left:
                data.knee?.left ??
                null

        };


        /* --------------------------------------------------
           TOBILLOS
           -------------------------------------------------- */

        this.ankle = {

            right:
                data.ankle?.right ??
                null,

            left:
                data.ankle?.left ??
                null

        };


        /* ==================================================
           TRONCO
           ================================================== */

        this.trunk =
            data.trunk ??
            null;


        /* ==================================================
           CUELLO
           ================================================== */

        this.neck =
            data.neck ??
            null;


        /* ==================================================
           INFORMACIÓN IA
           ================================================== */

        this.ai = {

            detected:
                data.ai?.detected ??
                false,

            confidence:
                data.ai?.confidence ??
                0,

            model:
                data.ai?.model ??
                "",

            validated:
                data.ai?.validated ??
                false

        };


        /* ==================================================
           OBSERVACIONES
           ================================================== */

        this.notes =
            data.notes ??
            "";

    }

}


/* ==========================================================
   SESSION
   ========================================================== */

class Session {

    constructor(data = {}) {

        this.analyst =
            data.analyst ??
            "";

        this.company =
            data.company ??
            "";

        this.workstation =
            data.workstation ??
            "";

        this.task =
            data.task ??
            "";

        this.date =
            data.date ??
            new Date().toISOString();

        this.comments =
            data.comments ??
            "";

    }

}


/* ==========================================================
   VIDEO
   ========================================================== */

class VideoInfo {

    constructor(data = {}) {

        this.name =
            data.name ??
            "";

        this.file =
            data.file ??
            "";

        this.duration =
            data.duration ??
            0;

        this.fps =
            data.fps ??
            25;

        this.width =
            data.width ??
            0;

        this.height =
            data.height ??
            0;

    }

}


/* ==========================================================
   PROJECT
   ========================================================== */

class Project {

    constructor(data = {}) {

        this.version =
            data.version ??
            "5.0.0";

        this.created =
            data.created ??
            new Date().toISOString();


        /* --------------------------------------------------
           SESIÓN
           -------------------------------------------------- */

        this.session =
            data.session instanceof Session
                ? data.session
                : new Session(
                    data.session ?? {}
                );


        /* --------------------------------------------------
           VÍDEO
           -------------------------------------------------- */

        this.video =
            data.video instanceof VideoInfo
                ? data.video
                : new VideoInfo(
                    data.video ?? {}
                );


        /* --------------------------------------------------
           ACCIONES
           -------------------------------------------------- */

        this.actions =
            Array.isArray(data.actions)
                ? data.actions
                : [];


        /* --------------------------------------------------
           RESULTADOS
           -------------------------------------------------- */

        this.results = {

            totalActions:
                data.results?.totalActions ??
                0,

            rightActions:
                data.results?.rightActions ??
                0,

            leftActions:
                data.results?.leftActions ??
                0,

            frequencyFactor:
                data.results?.frequencyFactor ??
                0,

            forceFactor:
                data.results?.forceFactor ??
                0,

            postureFactor:
                data.results?.postureFactor ??
                0,

            recoveryFactor:
                data.results?.recoveryFactor ??
                0,

            ocraIndex:
                data.results?.ocraIndex ??
                0,

            ocraClass:
                data.results?.ocraClass ??
                ""

        };

    }

}


/* ==========================================================
   ANALYSIS RESULT
   ==========================================================

   Representa el resultado COMPLETO de un único vídeo.

   IMPORTANTE:
   analysisResults en app.js contiene una instancia de
   AnalysisResult por cada vídeo analizado.

   Ejemplo:

       analysisResults[0] -> Vídeo 1
       analysisResults[1] -> Vídeo 2
       analysisResults[2] -> Vídeo 3
       analysisResults[3] -> Vídeo 4

   ========================================================== */

class AnalysisResult {

    constructor(data = {}) {

        /* ==================================================
           IDENTIFICACIÓN DEL VÍDEO
           ================================================== */

        this.videoIndex =
            data.videoIndex ??
            null;

        this.videoNumber =
            data.videoNumber ??
            null;

        this.fileName =
            data.fileName ??
            "";


        /* ==================================================
           METADATA
           ================================================== */

        this.metadata =
            data.metadata &&
            typeof data.metadata === "object"
                ? {
                    ...data.metadata
                }
                : {};


        /* ==================================================
           FRAMES POSE / KINOVEA
           ================================================== */

        this.poseFrames =
            Array.isArray(data.poseFrames)
                ? data.poseFrames
                : [];


        /* ==================================================
           FRAMES ANATÓMICOS
           ================================================== */

        this.anatomicalFrames =
            Array.isArray(data.anatomicalFrames)
                ? data.anatomicalFrames
                : [];


        /* ==================================================
           FRAMES BIOMECÁNICOS
           ================================================== */

        this.biomechanicalFrames =
            Array.isArray(data.biomechanicalFrames)
                ? data.biomechanicalFrames
                : [];


        /* ==================================================
           RESULTADOS POSTURALES

           Se rellenan después mediante PostureAnalyzer.
           ================================================== */

        this.postureResults =
            data.postureResults ??
            null;


        /* ==================================================
           CONFIGURACIÓN DEL CICLO
           ================================================== */

        this.cycleConfig = {

            enabled:
                data.cycleConfig?.enabled === true,

            mode:
                data.cycleConfig?.mode ??
                "video",

            cycleTime:
                data.cycleConfig?.cycleTime ??
                null,

            startTime:
                data.cycleConfig?.startTime ??
                null,

            endTime:
                data.cycleConfig?.endTime ??
                null

        };


        /* ==================================================
           MAPPING DE MARCADORES

           Cada AnalysisResult conserva exclusivamente
           el mapping del vídeo correspondiente.
           ================================================== */

        this.markerMapping =
            data.markerMapping &&
            typeof data.markerMapping === "object"
                ? {
                    ...data.markerMapping
                }
                : {};

    }


    /* ======================================================
       METADATA
       ====================================================== */

    setMetadata(metadata) {

        if (
            metadata &&
            typeof metadata === "object"
        ) {

            this.metadata = {

                ...metadata

            };

        }
        else {

            this.metadata = {};

        }

    }


    /* ======================================================
       POSE FRAMES
       ====================================================== */

    setPoseFrames(frames) {

        this.poseFrames =
            Array.isArray(frames)
                ? frames
                : [];

    }


    /* ======================================================
       ANATOMICAL FRAMES
       ====================================================== */

    setAnatomicalFrames(frames) {

        this.anatomicalFrames =
            Array.isArray(frames)
                ? frames
                : [];

    }


    /* ======================================================
       BIOMECHANICAL FRAMES
       ====================================================== */

    setBiomechanicalFrames(frames) {

        this.biomechanicalFrames =
            Array.isArray(frames)
                ? frames
                : [];

    }


    /* ======================================================
       POSTURE RESULTS
       ====================================================== */

    setPostureResults(results) {

        this.postureResults =
            results ??
            null;

    }


    /* ======================================================
       CYCLE CONFIG
       ====================================================== */

    setCycleConfig(config) {

        if (
            !config ||
            typeof config !== "object"
        ) {

            this.cycleConfig = {

                enabled: false,

                mode: "video",

                cycleTime: null,

                startTime: null,

                endTime: null

            };

            return;

        }


        this.cycleConfig = {

            enabled:
                config.enabled === true,

            mode:
                config.mode ??
                "video",

            cycleTime:
                config.cycleTime ??
                null,

            startTime:
                config.startTime ??
                null,

            endTime:
                config.endTime ??
                null

        };

    }


    /* ======================================================
       MAPPING
       ====================================================== */

    setMarkerMapping(mapping) {

        if (
            mapping &&
            typeof mapping === "object"
        ) {

            this.markerMapping = {

                ...mapping

            };

        }
        else {

            this.markerMapping = {};

        }

    }

}


/* ==========================================================
   EXPORTACIÓN GLOBAL
   ==========================================================

   NO utilizamos:

       export
       import

   Los archivos se cargan mediante <script> desde index.html.
   ========================================================== */

window.Action =
    Action;

window.Session =
    Session;

window.VideoInfo =
    VideoInfo;

window.Project =
    Project;

window.AnalysisResult =
    AnalysisResult;


/* ==========================================================
   COMPATIBILIDAD
   ========================================================== */

window.OCRAModels = {

    Action,

    Session,

    VideoInfo,

    Project,

    AnalysisResult

};


/* ==========================================================
   CONFIRMACIÓN
   ========================================================== */

console.log(
    "OCRA Video Analyzer: models.js cargado correctamente"
);

console.log(
    "AnalysisResult disponible:",
    typeof window.AnalysisResult === "function"
);

