"use strict";

/*
=========================================================
PMF SIGNED BIOMECHANICS
Capa biomecánica específica para Posturas y Movimientos Forzados.

Objetivo:
- Mantener signo (+/-) cuando el criterio lo exige.
- Mantener lateralidad.
- No alterar biomechanics.js de OCRA.
=========================================================
*/

function pmfPoint(frame, name) {
    if (typeof getPoint === "function") {
        const p = getPoint(frame, name);
        if (p) return p;
    }
    if (typeof getVirtualPoint === "function") {
        const p = getVirtualPoint(frame, name);
        if (p) return p;
    }
    return null;
}

function pmfResolve(frame, name) {
    const resolved = typeof resolvePointName === "function" ? resolvePointName(name) : name;
    return pmfPoint(frame, resolved);
}

function pmfFinitePoint(p) {
    return p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y));
}

function pmfSignedSegmentAngleVertical(a, b) {
    if (!pmfFinitePoint(a) || !pmfFinitePoint(b)) return {value:null,valid:false,reason:"landmarks_missing"};
    const dx = Number(b.x) - Number(a.x);
    const dy = -(Number(b.y) - Number(a.y));
    if (dx===0 && dy===0) return {value:null,valid:false,reason:"zero_length_segment"};
    // Signo por desplazamiento horizontal: izquierda negativo, derecha positivo.
    const angle = Math.atan2(dx, dy) * 180 / Math.PI;
    return {value:angle,valid:Number.isFinite(angle),reason:null};
}

function pmfSignedSegmentAngleHorizontal(a, b) {
    if (!pmfFinitePoint(a) || !pmfFinitePoint(b)) return {value:null,valid:false,reason:"landmarks_missing"};
    const dx = Number(b.x) - Number(a.x);
    const dy = -(Number(b.y) - Number(a.y));
    if (dx===0 && dy===0) return {value:null,valid:false,reason:"zero_length_segment"};
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    return {value:angle,valid:Number.isFinite(angle),reason:null};
}

function pmfSignedAngleABC(a,b,c) {
    if (!pmfFinitePoint(a)||!pmfFinitePoint(b)||!pmfFinitePoint(c)) return {value:null,valid:false,reason:"landmarks_missing"};
    const v1={x:Number(a.x)-Number(b.x),y:-(Number(a.y)-Number(b.y))};
    const v2={x:Number(c.x)-Number(b.x),y:-(Number(c.y)-Number(b.y))};
    const dot=v1.x*v2.x+v1.y*v2.y;
    const cross=v1.x*v2.y-v1.y*v2.x;
    const angle=Math.atan2(cross,dot)*180/Math.PI;
    return {value:angle,valid:Number.isFinite(angle),reason:null};
}

function pmfUnsignedAngleABC(a,b,c) {
    if (!pmfFinitePoint(a)||!pmfFinitePoint(b)||!pmfFinitePoint(c)) return {value:null,valid:false,reason:"landmarks_missing"};
    const v1={x:Number(a.x)-Number(b.x),y:-(Number(a.y)-Number(b.y))};
    const v2={x:Number(c.x)-Number(b.x),y:-(Number(c.y)-Number(b.y))};
    const n1=Math.hypot(v1.x,v1.y), n2=Math.hypot(v2.x,v2.y);
    if(!n1||!n2) return {value:null,valid:false,reason:"zero_length_segment"};
    const cos=Math.max(-1,Math.min(1,(v1.x*v2.x+v1.y*v2.y)/(n1*n2)));
    const angle=Math.acos(cos)*180/Math.PI;
    return {value:angle,valid:Number.isFinite(angle),reason:null};
}

function pmfFrameMeasurements(frame) {
    const out=[];
    if(!frame) return out;

    const hip=pmfResolve(frame,"V_HIP_CENTER");
    const shoulder=pmfResolve(frame,"V_SHOULDER_CENTER");
    const neck=pmfResolve(frame,"neck");
    const head=pmfResolve(frame,"V_HEAD_CENTER");
    const leftShoulder=pmfResolve(frame,"left_shoulder");
    const rightShoulder=pmfResolve(frame,"right_shoulder");
    const leftEar=pmfResolve(frame,"left_ear");
    const rightEar=pmfResolve(frame,"right_ear");

    const push=(name,result,meta={})=>{
        if(result && result.valid && Number.isFinite(Number(result.value))){
            out.push({
                name,
                value:Number(result.value),
                unit:"deg",
                timestamp:frame.time ?? null,
                frame_index:frame.index ?? null,
                valid:true,
                ...meta
            });
        }
    };

    // Convención PMF:
    // tronco sagital: flexión hacia delante positiva, extensión negativa.
    if(pmfFinitePoint(hip)&&pmfFinitePoint(shoulder)){
        const dx=Number(shoulder.x)-Number(hip.x);
        const dy=-(Number(shoulder.y)-Number(hip.y));
        if(!(dx===0&&dy===0)){
            const forwardPositive=Math.atan2(dx,dy)*180/Math.PI;
            push("trunk_flexion_signed",{value:forwardPositive,valid:true},{section:"trunk",motion:"flexion_extension"});
            push("trunk_lateral_signed",pmfSignedSegmentAngleVertical(hip,shoulder),{section:"trunk",motion:"lateral"});
        }
    }

    // Rotación axial aproximada en proyección: signo por orientación de hombros.
    if(pmfFinitePoint(leftShoulder)&&pmfFinitePoint(rightShoulder)){
        push("trunk_axial_rotation_signed",pmfSignedSegmentAngleHorizontal(leftShoulder,rightShoulder),{section:"trunk",motion:"rotation"});
    }

    if(pmfFinitePoint(neck)&&pmfFinitePoint(head)){
        push("head_flexion_signed",pmfSignedSegmentAngleVertical(neck,head),{section:"head_neck",motion:"head_flexion"});
        push("head_lateral_signed",pmfSignedSegmentAngleVertical(neck,head),{section:"head_neck",motion:"lateral"});
    }

    if(pmfFinitePoint(leftEar)&&pmfFinitePoint(rightEar)){
        push("head_axial_rotation_signed",pmfSignedSegmentAngleHorizontal(leftEar,rightEar),{section:"head_neck",motion:"rotation"});
    }

    const limbDefs=[
        ["knee_flexion_left","left_hip","left_knee","left_ankle","lower_left"],
        ["knee_flexion_right","right_hip","right_knee","right_ankle","lower_right"],
        ["ankle_angle_left","left_knee","left_ankle","left_foot","lower_left"],
        ["ankle_angle_right","right_knee","right_ankle","right_foot","lower_right"]
    ];
    for(const [name,aN,bN,cN,section] of limbDefs){
        const a=pmfResolve(frame,aN),b=pmfResolve(frame,bN),c=pmfResolve(frame,cN);
        const res=pmfUnsignedAngleABC(a,b,c);
        push(name,res,{section,motion:name});

        if(res.valid && name.startsWith("knee_flexion_")){
            const flexion=180-Number(res.value);
            push(name+"_standing_flexion",{value:flexion,valid:Number.isFinite(flexion)},{section,motion:"knee_standing_flexion",derivedFrom:name,formula:"180 - internal_angle"});
            const seatedExcursion=Math.abs(Number(res.value)-90);
            push(name+"_seated_excursion",{value:seatedExcursion,valid:Number.isFinite(seatedExcursion)},{section,motion:"knee_seated_excursion",derivedFrom:name,formula:"abs(internal_angle - 90)"});
        }

        if(res.valid && name.startsWith("ankle_angle_")){
            const dorsiPlantar=90-Number(res.value);
            push(name+"_dorsi_plantar",{value:dorsiPlantar,valid:Number.isFinite(dorsiPlantar)},{section,motion:"ankle_dorsi_plantar",derivedFrom:name,formula:"90 - internal_angle",signConvention:"positive=dorsiflexion; negative=plantar_flexion"});
        }
    }

    return out;
}

function pmfAnalyzeSignedBiomechanics(frames){
    const rows=[];
    for(const frame of Array.isArray(frames)?frames:[]){
        rows.push(...pmfFrameMeasurements(frame));
    }
    return rows;
}

function pmfSeries(measurements,name){
    return (Array.isArray(measurements)?measurements:[])
        .filter(x=>x && x.name===name && x.valid!==false && Number.isFinite(Number(x.value)) && Number.isFinite(Number(x.timestamp)))
        .map(x=>({timestamp:Number(x.timestamp),value:Number(x.value),valid:true,frame_index:x.frame_index??null}));
}

window.PMFSignedBiomechanics={
    signedSegmentAngleVertical:pmfSignedSegmentAngleVertical,
    signedSegmentAngleHorizontal:pmfSignedSegmentAngleHorizontal,
    signedAngleABC:pmfSignedAngleABC,
    unsignedAngleABC:pmfUnsignedAngleABC,
    frameMeasurements:pmfFrameMeasurements,
    analyze:pmfAnalyzeSignedBiomechanics,
    series:pmfSeries
};