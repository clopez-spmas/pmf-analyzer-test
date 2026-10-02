"use strict";

(function(){
    const order=["start","identification","videos","markers","results","project"];

    function goToPMFPage(name){
        if(!order.includes(name)) return;
        document.querySelectorAll("[data-pmf-page]").forEach(page=>{
            page.classList.toggle("is-active",page.dataset.pmfPage===name);
        });
        document.querySelectorAll("[data-pmf-nav]").forEach(button=>{
            const active=button.dataset.pmfNav===name;
            button.classList.toggle("is-active",active);
            button.setAttribute("aria-current",active?"step":"false");
        });
        window.scrollTo({top:0,behavior:"smooth"});
    }

    document.addEventListener("DOMContentLoaded",()=>{
        document.querySelectorAll("[data-pmf-nav]").forEach(button=>{
            button.addEventListener("click",()=>goToPMFPage(button.dataset.pmfNav));
        });
        document.querySelectorAll("[data-pmf-next]").forEach(button=>{
            button.addEventListener("click",()=>goToPMFPage(button.dataset.pmfNext));
        });
        document.querySelectorAll("[data-pmf-prev]").forEach(button=>{
            button.addEventListener("click",()=>goToPMFPage(button.dataset.pmfPrev));
        });
        goToPMFPage("start");
    });

    window.goToPMFPage=goToPMFPage;
})();