"use strict";
(function(){
    let currentScreen=0;

    function screens(){
        return Array.from(document.querySelectorAll(".screen"));
    }

    function showScreen(index){
        const all=screens();
        if(!all.length) return;
        currentScreen=Math.max(0,Math.min(all.length-1,Number(index)||0));
        all.forEach((screen,i)=>screen.classList.toggle("active",i===currentScreen));

        const counter=document.getElementById("screenCounter");
        if(counter) counter.textContent="Pantalla "+(currentScreen+1)+" de "+all.length;

        const prev=document.getElementById("prevBtn");
        const next=document.getElementById("nextBtn");
        if(prev) prev.disabled=currentScreen===0;
        if(next) next.disabled=currentScreen===all.length-1;

        window.scrollTo({top:0,behavior:"smooth"});
    }

    function goToPMFPage(name){
        const all=screens();
        const index=all.findIndex(s=>s.dataset.pageName===name);
        if(index>=0) showScreen(index);
    }

    document.addEventListener("DOMContentLoaded",()=>{
        document.getElementById("homeBtn")?.addEventListener("click",()=>showScreen(0));
        document.getElementById("prevBtn")?.addEventListener("click",()=>showScreen(currentScreen-1));
        document.getElementById("nextBtn")?.addEventListener("click",()=>showScreen(currentScreen+1));
        document.getElementById("loadProjectButton")?.addEventListener("click",()=>document.getElementById("loadProjectInput")?.click());
        document.getElementById("newStudyButton")?.addEventListener("click",()=>{
            if(window.confirm("¿Desea iniciar un nuevo estudio? Se perderán los cambios que no haya guardado.")){
                window.location.reload();
            }
        });
        showScreen(0);
    });

    window.goToPMFPage=goToPMFPage;
    window.showPMFScreen=showScreen;
})();