"use strict";

/*
=========================================================
PMF ENGINE
Motor independiente de cálculo y trazabilidad.
No decide criterios clínicos/técnicos fuera de PMFCriteria.
=========================================================
*/

function pmfValidSeries(series) {
    return (Array.isArray(series) ? series : [])
        .map(p => ({timestamp:Number(p.timestamp),value:Number(p.value),valid:p.valid!==false}))
        .filter(p => p.valid && Number.isFinite(p.timestamp) && Number.isFinite(p.value))
        .sort((a,b)=>a.timestamp-b.timestamp);
}

/*
Cuenta movimientos como se acordó:
neutral -> postura objetivo -> neutral = 1 movimiento.
No vuelve a contar mientras no haya retorno a neutral.
*/
function pmfCountExcursions(series, neutralPredicate, targetPredicate, startTime = null, endTime = null) {
    const points=pmfValidSeries(series).filter(p=>(startTime===null||p.timestamp>=startTime)&&(endTime===null||p.timestamp<=endTime));
    if(!points.length) return {count:0,frequencyPerMinute:0,durationSeconds:0,events:[]};

    const start=startTime===null?points[0].timestamp:Number(startTime);
    const end=endTime===null?points[points.length-1].timestamp:Number(endTime);
    const durationSeconds=Math.max(0,end-start);

    let state="WAIT_NEUTRAL";
    let excursionStart=null;
    let count=0;
    const events=[];

    for(const p of points){
        if(state==="WAIT_NEUTRAL"){
            if(neutralPredicate(p.value)) state="NEUTRAL";
            continue;
        }
        if(state==="NEUTRAL"){
            if(targetPredicate(p.value)){
                excursionStart={timestamp:p.timestamp,value:p.value};
                state="TARGET";
            }
            continue;
        }
        if(state==="TARGET" && neutralPredicate(p.value)){
            count++;
            events.push({
                number:count,
                targetEnteredAt:excursionStart.timestamp,
                targetEntryAngle:excursionStart.value,
                neutralReturnedAt:p.timestamp,
                neutralReturnAngle:p.value
            });
            excursionStart=null;
            state="NEUTRAL";
        }
    }

    return {
        count,
        frequencyPerMinute:durationSeconds>0?count/(durationSeconds/60):0,
        durationSeconds,
        events,
        incompleteExcursion:state==="TARGET"
    };
}

function pmfCriticalTime(series, criticalPredicate, startTime = null, endTime = null) {
    const points=pmfValidSeries(series).filter(p=>(startTime===null||p.timestamp>=startTime)&&(endTime===null||p.timestamp<=endTime));
    if(points.length<2) return {criticalSeconds:0,totalSeconds:0,criticalPercent:0};

    const start=startTime===null?points[0].timestamp:Number(startTime);
    const end=endTime===null?points[points.length-1].timestamp:Number(endTime);
    let criticalSeconds=0;

    for(let i=0;i<points.length-1;i++){
        const p=points[i], n=points[i+1];
        const interval=Math.max(0,Math.min(n.timestamp,end)-Math.max(p.timestamp,start));
        if(interval>0 && criticalPredicate(p.value)) criticalSeconds+=interval;
    }
    const totalSeconds=Math.max(0,end-start);
    return {
        criticalSeconds,
        totalSeconds,
        criticalPercent:totalSeconds>0?(criticalSeconds/totalSeconds)*100:0
    };
}

function pmfDetectStaticEpisodes(series, bandPredicate, minSeconds = 4, startTime = null, endTime = null) {
    const points=pmfValidSeries(series).filter(p=>(startTime===null||p.timestamp>=startTime)&&(endTime===null||p.timestamp<=endTime));
    const episodes=[];
    let active=null;

    for(let i=0;i<points.length;i++){
        const p=points[i];
        const inBand=bandPredicate(p.value);
        if(inBand && !active) active={startTime:p.timestamp,startAngle:p.value,values:[p.value]};
        else if(inBand && active) active.values.push(p.value);

        const closes=active && (!inBand || i===points.length-1);
        if(closes){
            const endPoint=inBand&&i===points.length-1?p:points[Math.max(0,i-1)];
            const duration=Math.max(0,endPoint.timestamp-active.startTime);
            if(duration>minSeconds){
                episodes.push({
                    startTime:active.startTime,
                    endTime:endPoint.timestamp,
                    duration,
                    startAngle:active.startAngle,
                    endAngle:endPoint.value,
                    averageAngle:active.values.reduce((a,b)=>a+b,0)/active.values.length,
                    maxAngle:Math.max(...active.values),
                    minAngle:Math.min(...active.values)
                });
            }
            active=null;
        }
    }

    return episodes;
}

function pmfWorstStatus(results) {
    const R=window.PMFCriteria?.RESULT;
    const rank={
        [R?.NOT_EVALUATED]:0,
        [R?.ACCEPTABLE]:1,
        [R?.NEEDS_CONFIRMATION]:2,
        [R?.NOT_ACCEPTABLE]:3
    };
    return (Array.isArray(results)?results:[]).reduce((worst,current)=>{
        if(!worst) return current;
        return (rank[current?.status]??0)>(rank[worst?.status]??0)?current:worst;
    },null);
}

function pmfTrace({section,mode,measurement,sourceVideos=[],calculated={},criterionResult,manual={}}) {
    return {
        generatedAt:new Date().toISOString(),
        section,
        mode,
        measurement,
        sourceVideos,
        calculated,
        criterion:{
            id:criterionResult?.criterionId||null,
            status:criterionResult?.status||null,
            reason:criterionResult?.reason||null,
            inputs:criterionResult?.inputs||{}
        },
        manual:{
            required:criterionResult?.status===window.PMFCriteria?.RESULT?.NEEDS_CONFIRMATION,
            confirmed:Boolean(manual.confirmed),
            value:manual.value??null,
            technician:manual.technician??null,
            confirmedAt:manual.confirmedAt??null,
            note:manual.note??null
        }
    };
}

window.PMFEngine={
    validSeries:pmfValidSeries,
    countExcursions:pmfCountExcursions,
    criticalTime:pmfCriticalTime,
    detectStaticEpisodes:pmfDetectStaticEpisodes,
    worstStatus:pmfWorstStatus,
    trace:pmfTrace
};