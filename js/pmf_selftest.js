"use strict";

(function(){
    function approx(a,b,tol=0.001){return Math.abs(a-b)<=tol;}
    const failures=[];

    let r=PMFSignedBiomechanics.signedSegmentAngleVertical({x:0,y:1},{x:0,y:0});
    if(!r.valid||!approx(r.value,0)) failures.push("vertical_neutral");

    r=PMFSignedBiomechanics.signedSegmentAngleVertical({x:0,y:1},{x:1,y:0});
    if(!r.valid||!(r.value>0)) failures.push("vertical_positive_sign");

    r=PMFSignedBiomechanics.signedSegmentAngleVertical({x:0,y:1},{x:-1,y:0});
    if(!r.valid||!(r.value<0)) failures.push("vertical_negative_sign");

    const e=PMFEngine.countExcursions(
        [
            {timestamp:0,value:0,valid:true},
            {timestamp:1,value:30,valid:true},
            {timestamp:2,value:40,valid:true},
            {timestamp:3,value:0,valid:true},
            {timestamp:4,value:35,valid:true},
            {timestamp:5,value:0,valid:true}
        ],
        v=>v>=-5&&v<=5,
        v=>v>20
    );
    if(e.count!==2) failures.push("excursion_count");

    window.PMFSelfTestResult={ok:failures.length===0,failures};
    if(failures.length) console.error("PMF self-test failures",failures);
    else console.log("PMF self-test OK");
})();