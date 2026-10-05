"use strict";

/*
=========================================================
PMF CRITERIA
Posturas y Movimientos Forzados
Criterios codificados desde el documento interno
"VALORACIÓN POSTURAS Y MOVIMIENTOS FORZADOS - MARZO 2026".

IMPORTANTE:
- No existe resultado global.
- Cada sección corporal se resuelve de forma independiente.
- Cuando el criterio exige una condición no inferible de Kinovea
  (p. ej. soporte completo), el motor devuelve REQUIERE_CONFIRMACION.
=========================================================
*/

const PMF_RESULT = Object.freeze({
    ACCEPTABLE: "ACEPTABLE",
    NOT_ACCEPTABLE: "NO_ACEPTABLE",
    NEEDS_CONFIRMATION: "REQUIERE_CONFIRMACION",
    NOT_EVALUATED: "NO_EVALUADO"
});

const PMF_FREQUENCY_LIMIT = 2;
const PMF_CRITICAL_TIME_LIMIT_PERCENT = 60;
const PMF_STATIC_MIN_SECONDS = 4;

function pmfResult(status, reason, criterionId, inputs = {}) {
    return { status, reason, criterionId, inputs };
}

function evaluateTrunkFlexionDynamic({ angle, frequencyPerMinute, fullTrunkSupport = null }) {
    const a = Number(angle);
    const f = Number(frequencyPerMinute);
    if (!Number.isFinite(a) || !Number.isFinite(f)) {
        return pmfResult(PMF_RESULT.NOT_EVALUATED, "Faltan ángulo o frecuencia válidos.", "DYN_TRUNK_FLEX");
    }

    const evalAngle = a > 90 ? 90 : a;

    if (evalAngle >= 1 && evalAngle <= 20) {
        return pmfResult(PMF_RESULT.ACCEPTABLE, "Flexión de tronco entre 1° y 20°.", "DYN_TRUNK_FLEX_1_20", {angle:evalAngle,frequencyPerMinute:f});
    }

    if (evalAngle > 20 && evalAngle <= 60) {
        return pmfResult(
            f < PMF_FREQUENCY_LIMIT ? PMF_RESULT.ACCEPTABLE : PMF_RESULT.NOT_ACCEPTABLE,
            f < PMF_FREQUENCY_LIMIT
                ? "Flexión entre 21° y 60° con frecuencia inferior a 2 mov/min."
                : "Flexión entre 21° y 60° con frecuencia igual o superior a 2 mov/min.",
            "DYN_TRUNK_FLEX_21_60",
            {angle:evalAngle,frequencyPerMinute:f}
        );
    }

    if ((evalAngle > 60 && evalAngle <= 90) || evalAngle <= 0) {
        if (f >= PMF_FREQUENCY_LIMIT) {
            return pmfResult(PMF_RESULT.NOT_ACCEPTABLE, "Postura crítica con frecuencia igual o superior a 2 mov/min.", "DYN_TRUNK_FLEX_CRITICAL_FREQ", {angle:evalAngle,frequencyPerMinute:f,fullTrunkSupport});
        }
        if (fullTrunkSupport === null) {
            return pmfResult(PMF_RESULT.NEEDS_CONFIRMATION, "Debe confirmarse manualmente si existe soporte completo del tronco.", "DYN_TRUNK_FLEX_SUPPORT", {angle:evalAngle,frequencyPerMinute:f,fullTrunkSupport});
        }
        return pmfResult(
            fullTrunkSupport ? PMF_RESULT.ACCEPTABLE : PMF_RESULT.NOT_ACCEPTABLE,
            fullTrunkSupport
                ? "Frecuencia inferior a 2 mov/min y soporte completo del tronco."
                : "Frecuencia inferior a 2 mov/min pero sin soporte completo del tronco.",
            "DYN_TRUNK_FLEX_SUPPORT",
            {angle:evalAngle,frequencyPerMinute:f,fullTrunkSupport}
        );
    }

    return pmfResult(PMF_RESULT.NOT_EVALUATED, "Ángulo fuera del intervalo codificado del criterio.", "DYN_TRUNK_FLEX_RANGE", {angle:evalAngle,frequencyPerMinute:f});
}

function evaluateSymmetricDynamic({ angle, frequencyPerMinute, criticalTimePercent, neutralMin, neutralMax, criterionId, label }) {
    const a = Number(angle);
    const f = Number(frequencyPerMinute);
    const t = Number(criticalTimePercent);

    if (!Number.isFinite(a) || !Number.isFinite(f)) {
        return pmfResult(PMF_RESULT.NOT_EVALUATED, "Faltan ángulo o frecuencia válidos.", criterionId);
    }

    if (a >= neutralMin && a <= neutralMax) {
        return pmfResult(PMF_RESULT.ACCEPTABLE, `${label}: ángulo dentro del rango aceptable.`, criterionId + "_NEUTRAL", {angle:evalAngle,frequencyPerMinute:f,criticalTimePercent:t});
    }

    if (f >= PMF_FREQUENCY_LIMIT) {
        return pmfResult(PMF_RESULT.NOT_ACCEPTABLE, `${label}: fuera del rango aceptable y frecuencia igual o superior a 2 mov/min.`, criterionId + "_HIGH_FREQ", {angle:evalAngle,frequencyPerMinute:f,criticalTimePercent:t});
    }

    if (!Number.isFinite(t)) {
        return pmfResult(PMF_RESULT.NEEDS_CONFIRMATION, `${label}: debe determinarse el porcentaje de tiempo en postura crítica.`, criterionId + "_TIME", {angle:evalAngle,frequencyPerMinute:f,criticalTimePercent:null});
    }

    return pmfResult(
        t >= PMF_CRITICAL_TIME_LIMIT_PERCENT ? PMF_RESULT.NOT_ACCEPTABLE : PMF_RESULT.ACCEPTABLE,
        t >= PMF_CRITICAL_TIME_LIMIT_PERCENT
            ? `${label}: postura crítica durante el 60% o más del tiempo de la tarea.`
            : `${label}: frecuencia inferior a 2 mov/min y postura crítica no superior al 60% del tiempo de la tarea.`,
        criterionId + "_TIME",
        {angle:evalAngle,frequencyPerMinute:f,criticalTimePercent:t}
    );
}

function evaluateTrunkLateralDynamic(inputs) {
    return evaluateSymmetricDynamic({...inputs,neutralMin:-10,neutralMax:10,criterionId:"DYN_TRUNK_LATERAL",label:"Inclinación lateral de tronco"});
}
function evaluateTrunkRotationDynamic(inputs) {
    return evaluateSymmetricDynamic({...inputs,neutralMin:-10,neutralMax:10,criterionId:"DYN_TRUNK_ROTATION",label:"Rotación axial de tronco"});
}
function evaluateHeadLateralDynamic(inputs) {
    return evaluateSymmetricDynamic({...inputs,neutralMin:-10,neutralMax:10,criterionId:"DYN_HEAD_LATERAL",label:"Lateralización de cabeza"});
}
function evaluateHeadRotationDynamic(inputs) {
    return evaluateSymmetricDynamic({...inputs,neutralMin:-45,neutralMax:45,criterionId:"DYN_HEAD_ROTATION",label:"Rotación axial de cabeza"});
}

function evaluateHeadFlexionDynamic({ angle, frequencyPerMinute, criticalTimePercent }) {
    const a=Number(angle), f=Number(frequencyPerMinute), t=Number(criticalTimePercent);
    if(!Number.isFinite(a)||!Number.isFinite(f)) return pmfResult(PMF_RESULT.NOT_EVALUATED,"Faltan ángulo o frecuencia válidos.","DYN_HEAD_FLEX");
    if(a>=-40 && a<=0) return pmfResult(PMF_RESULT.ACCEPTABLE,"Flexión/extensión de cabeza entre -40° y 0°.","DYN_HEAD_FLEX_NEUTRAL",{angle:evalAngle,frequencyPerMinute:f,criticalTimePercent:t});
    if(f>=PMF_FREQUENCY_LIMIT) return pmfResult(PMF_RESULT.NOT_ACCEPTABLE,"Fuera del rango -40° a 0° y frecuencia igual o superior a 2 mov/min.","DYN_HEAD_FLEX_HIGH_FREQ",{angle:evalAngle,frequencyPerMinute:f,criticalTimePercent:t});
    if(!Number.isFinite(t)) return pmfResult(PMF_RESULT.NEEDS_CONFIRMATION,"Debe determinarse el porcentaje de tiempo en postura crítica.","DYN_HEAD_FLEX_TIME",{angle:evalAngle,frequencyPerMinute:f});
    return pmfResult(t>=60?PMF_RESULT.NOT_ACCEPTABLE:PMF_RESULT.ACCEPTABLE,t>=60?"Postura crítica durante el 60% o más del tiempo de la tarea.":"Frecuencia inferior a 2 mov/min y postura crítica no superior al 60% del tiempo de la tarea.","DYN_HEAD_FLEX_TIME",{angle:evalAngle,frequencyPerMinute:f,criticalTimePercent:t});
}

function evaluateTrunkStatic({ motion, angle, fullTrunkSupport = null, durationCriterionResult = null, lumbarConvex = null }) {
    const originalAngle = Number(angle);
    const a = originalAngle > 90 ? 90 : originalAngle;

    if (motion === "lumbar_convex") {
        if (lumbarConvex === null) return pmfResult(PMF_RESULT.NEEDS_CONFIRMATION,"Debe confirmarse manualmente la existencia de postura convexa lumbar.","STAT_TRUNK_CONVEX");
        return pmfResult(lumbarConvex?PMF_RESULT.NOT_ACCEPTABLE:PMF_RESULT.ACCEPTABLE,lumbarConvex?"Existe postura convexa de la espina lumbar.":"No existe postura convexa de la espina lumbar.","STAT_TRUNK_CONVEX",{lumbarConvex});
    }

    if(!Number.isFinite(a)) return pmfResult(PMF_RESULT.NOT_EVALUATED,"Falta ángulo válido.","STAT_TRUNK");

    if (motion === "lateral" || motion === "rotation") {
        return pmfResult(
            a < -10 || a > 10 ? PMF_RESULT.NOT_ACCEPTABLE : PMF_RESULT.ACCEPTABLE,
            a < -10 || a > 10 ? "Postura estática fuera del rango -10° a 10°." : "Postura estática dentro del rango -10° a 10°.",
            motion === "lateral" ? "STAT_TRUNK_LATERAL" : "STAT_TRUNK_ROTATION",
            {angle:evalAngle}
        );
    }

    if (motion === "flexion") {
        if (a > 60) return pmfResult(PMF_RESULT.NOT_ACCEPTABLE,"Flexión estática de tronco superior a 60°.","STAT_TRUNK_FLEX_GT60",{angle:evalAngle});
        if (a >= 0 && a <= 20) return pmfResult(PMF_RESULT.ACCEPTABLE,"Flexión estática de tronco entre 0° y 20°.","STAT_TRUNK_FLEX_0_20",{angle:evalAngle});
        if (a > 20 && a <= 60) {
            if (fullTrunkSupport === true) return pmfResult(PMF_RESULT.ACCEPTABLE,"Flexión entre 20° y 60° con soporte completo del tronco.","STAT_TRUNK_FLEX_20_60_SUPPORT",{angle:evalAngle,fullTrunkSupport});
            if (fullTrunkSupport === null) return pmfResult(PMF_RESULT.NEEDS_CONFIRMATION,"Debe confirmarse si existe soporte completo del tronco.","STAT_TRUNK_FLEX_20_60_SUPPORT",{angle:evalAngle});
            if (durationCriterionResult === PMF_RESULT.ACCEPTABLE || durationCriterionResult === PMF_RESULT.NOT_ACCEPTABLE) {
                return pmfResult(durationCriterionResult,"Resultado según la duración máxima aceptable de la Figura 5.10 y la Tabla 5.8.","STAT_TRUNK_FLEX_20_60_DURATION",{angle:evalAngle,fullTrunkSupport,durationCriterionResult});
            }
            return pmfResult(PMF_RESULT.NEEDS_CONFIRMATION,"Sin soporte completo: falta aplicar la duración máxima aceptable de la Figura 5.10 y la Tabla 5.8.","STAT_TRUNK_FLEX_20_60_DURATION",{angle:evalAngle,fullTrunkSupport});
        }
        if (a < 0) {
            if (fullTrunkSupport === null) return pmfResult(PMF_RESULT.NEEDS_CONFIRMATION,"Debe confirmarse el soporte completo del tronco.","STAT_TRUNK_EXTENSION_SUPPORT",{angle:evalAngle});
            return pmfResult(fullTrunkSupport?PMF_RESULT.ACCEPTABLE:PMF_RESULT.NOT_ACCEPTABLE,fullTrunkSupport?"Extensión con soporte completo del tronco.":"Extensión sin soporte completo del tronco.","STAT_TRUNK_EXTENSION_SUPPORT",{angle:evalAngle,fullTrunkSupport});
        }
    }

    return pmfResult(PMF_RESULT.NOT_EVALUATED,"Combinación estática de tronco no codificada.","STAT_TRUNK_UNKNOWN",{motion,angle:evalAngle});
}

function evaluateHeadStatic({ motion, angle, fullHeadSupport = null }) {
    const a=Number(angle);
    if(!Number.isFinite(a)) return pmfResult(PMF_RESULT.NOT_EVALUATED,"Falta ángulo válido.","STAT_HEAD");

    if(motion==="lateral") return pmfResult(a<-10||a>10?PMF_RESULT.NOT_ACCEPTABLE:PMF_RESULT.ACCEPTABLE,a<-10||a>10?"Lateralización estática fuera de -10° a 10°.":"Lateralización estática entre -10° y 10°.","STAT_HEAD_LATERAL",{angle:evalAngle});
    if(motion==="rotation") return pmfResult(a<-45||a>45?PMF_RESULT.NOT_ACCEPTABLE:PMF_RESULT.ACCEPTABLE,a<-45||a>45?"Rotación axial estática fuera de -45° a 45°.":"Rotación axial estática entre -45° y 45°.","STAT_HEAD_ROTATION",{angle:evalAngle});
    if(motion==="neck_flexion") return pmfResult(a<0||a>25?PMF_RESULT.NOT_ACCEPTABLE:PMF_RESULT.ACCEPTABLE,a<0||a>25?"Flexo-extensión de cuello fuera de 0° a 25°.":"Flexo-extensión de cuello entre 0° y 25°.","STAT_NECK_FLEX",{angle:evalAngle});
    if(motion==="head_extension") {
        if(a>=0) return pmfResult(PMF_RESULT.NOT_EVALUATED,"Este criterio corresponde a extensión de cabeza (<0°).","STAT_HEAD_EXTENSION",{angle:evalAngle});
        if(fullHeadSupport===null) return pmfResult(PMF_RESULT.NEEDS_CONFIRMATION,"Debe confirmarse el soporte completo de la cabeza.","STAT_HEAD_EXTENSION_SUPPORT",{angle:evalAngle});
        return pmfResult(fullHeadSupport?PMF_RESULT.ACCEPTABLE:PMF_RESULT.NOT_ACCEPTABLE,fullHeadSupport?"Extensión de cabeza con soporte completo.":"Extensión de cabeza sin soporte completo.","STAT_HEAD_EXTENSION_SUPPORT",{angle:evalAngle,fullHeadSupport});
    }
    return pmfResult(PMF_RESULT.NEEDS_CONFIRMATION,"El criterio seleccionado requiere datos adicionales o criterio de duración no codificado todavía.","STAT_HEAD_PENDING",{motion,angle:evalAngle});
}


function evaluateKneeDynamic({ posture, internalAngle, standingFlexion, seatedExcursion, frequencyPerMinute }) {
    const f=Number(frequencyPerMinute);
    if(!Number.isFinite(f)) return pmfResult(PMF_RESULT.NOT_EVALUATED,"Falta frecuencia válida.","DYN_KNEE");

    if(posture==="standing"){
        const flex=Number(standingFlexion);
        if(!Number.isFinite(flex)) return pmfResult(PMF_RESULT.NOT_EVALUATED,"Falta flexión de rodilla válida.","DYN_KNEE_STANDING");
        if(flex < 135){
            return pmfResult(PMF_RESULT.ACCEPTABLE,"Flexión de rodilla de pie inferior a 135°.","DYN_KNEE_STANDING_LT135",{standingFlexion:flex,frequencyPerMinute:f});
        }
        return pmfResult(
            f < PMF_FREQUENCY_LIMIT ? PMF_RESULT.ACCEPTABLE : PMF_RESULT.NOT_ACCEPTABLE,
            f < PMF_FREQUENCY_LIMIT
                ? "Flexión de rodilla próxima o superior a 135° con frecuencia inferior a 2 mov/min."
                : "Flexión de rodilla próxima o superior a 135° con frecuencia igual o superior a 2 mov/min.",
            "DYN_KNEE_STANDING_135",
            {standingFlexion:flex,frequencyPerMinute:f}
        );
    }

    if(posture==="seated"){
        const excursion=Number(seatedExcursion);
        const internal=Number(internalAngle);
        if(!Number.isFinite(excursion) || !Number.isFinite(internal)) return pmfResult(PMF_RESULT.NOT_EVALUATED,"Falta ángulo de rodilla sentado válido.","DYN_KNEE_SEATED");
        if(excursion < 40){
            return pmfResult(PMF_RESULT.ACCEPTABLE,"Excursión de rodilla sentado inferior a 40° respecto a 90°.","DYN_KNEE_SEATED_LT40",{internalAngle:internal,seatedExcursion:excursion,frequencyPerMinute:f});
        }
        return pmfResult(
            f < PMF_FREQUENCY_LIMIT ? PMF_RESULT.ACCEPTABLE : PMF_RESULT.NOT_ACCEPTABLE,
            f < PMF_FREQUENCY_LIMIT
                ? "Excursión próxima o superior a 40° con frecuencia inferior a 2 mov/min."
                : "Excursión próxima o superior a 40° con frecuencia igual o superior a 2 mov/min.",
            "DYN_KNEE_SEATED_40",
            {internalAngle:internal,seatedExcursion:excursion,frequencyPerMinute:f}
        );
    }

    return pmfResult(PMF_RESULT.NEEDS_CONFIRMATION,"Debe seleccionarse postura sentado o de pie.","DYN_KNEE_POSTURE",{posture});
}

function evaluateKneeStatic({ posture, internalAngle, standingFlexion, ischialSupport = null, trunkPosteriorInclined = null }) {
    const internal=Number(internalAngle);

    if(posture==="standing"){
        const flex=Number(standingFlexion);
        if(!Number.isFinite(flex)) return pmfResult(PMF_RESULT.NOT_EVALUATED,"Falta flexión de rodilla válida.","STAT_KNEE_STANDING");
        if(ischialSupport===true){
            return pmfResult(PMF_RESULT.ACCEPTABLE,"Postura de pie con apoyo isquiotibial.","STAT_KNEE_STANDING_ISCHIAL",{standingFlexion:flex,ischialSupport});
        }
        if(flex < 135){
            return pmfResult(PMF_RESULT.ACCEPTABLE,"Flexión estática de rodilla de pie inferior a 135°.","STAT_KNEE_STANDING_LT135",{standingFlexion:flex,ischialSupport});
        }
        if(ischialSupport===null){
            return pmfResult(PMF_RESULT.NEEDS_CONFIRMATION,"Debe confirmarse si existe apoyo isquiotibial.","STAT_KNEE_STANDING_SUPPORT",{standingFlexion:flex});
        }
        return pmfResult(PMF_RESULT.NOT_ACCEPTABLE,"Flexión estática de rodilla de pie en el límite o superior sin apoyo isquiotibial.","STAT_KNEE_STANDING_135",{standingFlexion:flex,ischialSupport});
    }

    if(posture==="seated"){
        if(!Number.isFinite(internal)) return pmfResult(PMF_RESULT.NOT_EVALUATED,"Falta ángulo interno de rodilla válido.","STAT_KNEE_SEATED");
        if(internal>=90 && internal<=135){
            return pmfResult(PMF_RESULT.ACCEPTABLE,"Ángulo interno de rodilla sentado entre 90° y 135°.","STAT_KNEE_SEATED_90_135",{internalAngle:internal});
        }
        if(internal<90){
            return pmfResult(PMF_RESULT.NOT_ACCEPTABLE,"Ángulo interno de rodilla sentado inferior a 90°.","STAT_KNEE_SEATED_LT90",{internalAngle:internal});
        }
        if(internal>135){
            if(trunkPosteriorInclined===null){
                return pmfResult(PMF_RESULT.NEEDS_CONFIRMATION,"Con rodilla >135° debe confirmarse si el tronco está posteriormente inclinado.","STAT_KNEE_SEATED_GT135_TRUNK",{internalAngle:internal});
            }
            return pmfResult(
                trunkPosteriorInclined ? PMF_RESULT.ACCEPTABLE : PMF_RESULT.NOT_ACCEPTABLE,
                trunkPosteriorInclined
                    ? "Rodilla >135° con tronco posteriormente inclinado."
                    : "Rodilla >135° sin tronco posteriormente inclinado.",
                "STAT_KNEE_SEATED_GT135_TRUNK",
                {internalAngle:internal,trunkPosteriorInclined}
            );
        }
    }

    return pmfResult(PMF_RESULT.NEEDS_CONFIRMATION,"Debe seleccionarse postura sentado o de pie.","STAT_KNEE_POSTURE",{posture});
}

function evaluateAnkleDynamic({ dorsiPlantarAngle, frequencyPerMinute }) {
    const a=Number(dorsiPlantarAngle), f=Number(frequencyPerMinute);
    if(!Number.isFinite(a)||!Number.isFinite(f)) return pmfResult(PMF_RESULT.NOT_EVALUATED,"Faltan ángulo de tobillo o frecuencia válidos.","DYN_ANKLE");

    const dorsiflexion=Math.max(0,a);
    const plantarFlexion=Math.max(0,-a);

    const exceedsRange=dorsiflexion>=20 || plantarFlexion>=50;

    if(!exceedsRange && f<PMF_FREQUENCY_LIMIT){
        return pmfResult(PMF_RESULT.ACCEPTABLE,"Tobillo dentro de rango y frecuencia inferior a 2 mov/min.","DYN_ANKLE_ACCEPT",{dorsiPlantarAngle:a,dorsiflexion,plantarFlexion,frequencyPerMinute:f});
    }
    return pmfResult(PMF_RESULT.NOT_ACCEPTABLE,
        exceedsRange
            ? "Se alcanza o supera el rango límite de tobillo."
            : "Frecuencia de tobillo igual o superior a 2 mov/min.",
        "DYN_ANKLE_LIMIT",
        {dorsiPlantarAngle:a,dorsiflexion,plantarFlexion,frequencyPerMinute:f}
    );
}

function evaluateAnkleStatic({ dorsiPlantarAngle }) {
    const a=Number(dorsiPlantarAngle);
    if(!Number.isFinite(a)) return pmfResult(PMF_RESULT.NOT_EVALUATED,"Falta ángulo de tobillo válido.","STAT_ANKLE");
    const dorsiflexion=Math.max(0,a);
    const plantarFlexion=Math.max(0,-a);

    const acceptable=dorsiflexion<20 && plantarFlexion<50;
    return pmfResult(
        acceptable ? PMF_RESULT.ACCEPTABLE : PMF_RESULT.NOT_ACCEPTABLE,
        acceptable
            ? "Postura estática de tobillo por debajo de los límites de dorsiflexión 20° y flexión plantar 50°."
            : "Postura estática de tobillo en el límite o por encima del rango permitido.",
        "STAT_ANKLE_LIMIT",
        {dorsiPlantarAngle:a,dorsiflexion,plantarFlexion}
    );
}

window.PMFCriteria = {
    RESULT: PMF_RESULT,
    LIMITS: {frequencyPerMinute:PMF_FREQUENCY_LIMIT,criticalTimePercent:PMF_CRITICAL_TIME_LIMIT_PERCENT,staticMinSeconds:PMF_STATIC_MIN_SECONDS},
    dynamic: {
        trunkFlexion:evaluateTrunkFlexionDynamic,
        trunkLateral:evaluateTrunkLateralDynamic,
        trunkRotation:evaluateTrunkRotationDynamic,
        headFlexion:evaluateHeadFlexionDynamic,
        headLateral:evaluateHeadLateralDynamic,
        headRotation:evaluateHeadRotationDynamic
    },
    static: {
        trunk:evaluateTrunkStatic,
        head:evaluateHeadStatic,
        knee:evaluateKneeStatic,
        ankle:evaluateAnkleStatic
    },
    lowerLimb: {
        kneeDynamic:evaluateKneeDynamic,
        ankleDynamic:evaluateAnkleDynamic
    }
};