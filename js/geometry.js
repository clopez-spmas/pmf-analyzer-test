"use strict";

/*
=========================================================
OCRA Video Analyzer
Geometry Engine
=========================================================

Responsabilidades:

- Operaciones vectoriales 3D.
- Cálculo de ángulos articulares.
- Distancias entre puntos.

Los puntos recibidos deben tener formato:

{
    x: Number,
    y: Number,
    z: Number (opcional)
}

=========================================================
*/


/*
=========================================================
Crear vector entre dos puntos

Resultado:
B - A
=========================================================
*/

function vectorBetween(a, b) {

    if (!a || !b) {
        return null;
    }

    return {

        x:
            Number(b.x) -
            Number(a.x),

        y:
            Number(b.y) -
            Number(a.y),

        z:
            (Number(b.z) || 0) -
            (Number(a.z) || 0)

    };

}


/*
=========================================================
Producto escalar
=========================================================
*/

function dotProduct(a, b) {

    if (!a || !b) {
        return null;
    }

    return (

        a.x * b.x +

        a.y * b.y +

        a.z * b.z

    );

}


/*
=========================================================
Módulo del vector
=========================================================
*/

function vectorLength(v) {

    if (!v) {
        return null;
    }

    return Math.sqrt(

        v.x * v.x +

        v.y * v.y +

        v.z * v.z

    );

}


/*
=========================================================
Normalizar vector
=========================================================
*/

function normalizeVector(v) {

    const length =
        vectorLength(v);


    if (
        length === null ||
        length === 0 ||
        !Number.isFinite(length)
    ) {

        return null;

    }


    return {

        x:
            v.x / length,

        y:
            v.y / length,

        z:
            v.z / length

    };

}


/*
=========================================================
Ángulo entre dos vectores

Resultado en grados
=========================================================
*/

function angleBetweenVectors(a, b) {

    if (!a || !b) {
        return null;
    }


    const lengthA =
        vectorLength(a);


    const lengthB =
        vectorLength(b);


    if (
        lengthA === null ||
        lengthB === null ||
        lengthA === 0 ||
        lengthB === 0
    ) {

        return null;

    }


    let cosAngle =
        dotProduct(a, b) /
        (
            lengthA *
            lengthB
        );


    /*
    Evitar errores numéricos
    */

    cosAngle =
        Math.max(
            -1,
            Math.min(
                1,
                cosAngle
            )
        );


    return (

        Math.acos(cosAngle)
        *
        180
        /
        Math.PI

    );

}


/*
=========================================================
Ángulo articular ABC

Ejemplo:

Hombro ---- Codo ---- Muñeca

A = hombro
B = codo
C = muñeca

El ángulo se calcula en B.
=========================================================
*/

function angleAtPoint(a, b, c) {

    if (
        !a ||
        !b ||
        !c
    ) {

        return {

            value:
                null,

            valid:
                false,

            reason:
                "landmarks_missing"

        };

    }


    const ba =
        vectorBetween(
            b,
            a
        );


    const bc =
        vectorBetween(
            b,
            c
        );


    const angle =
        angleBetweenVectors(
            ba,
            bc
        );


    if (
        angle === null ||
        !Number.isFinite(angle)
    ) {

        return {

            value:
                null,

            valid:
                false,

            reason:
                "calculation_error"

        };

    }


    return {

        value:
            angle,

        valid:
            true,

        reason:
            null

    };

}


/*
=========================================================
Distancia entre dos puntos
=========================================================
*/

function distanceBetween(a, b) {

    const vector =
        vectorBetween(
            a,
            b
        );


    return vectorLength(
        vector
    );

}


/*
=========================================================
Exportación global para navegador

IMPORTANTE:

Este proyecto utiliza scripts clásicos,
no módulos ES6.

Por eso NO utilizamos:

export
import

=========================================================
*/

window.Geometry = {

    vectorBetween,

    dotProduct,

    vectorLength,

    normalizeVector,

    angleBetweenVectors,

    angleAtPoint,

    distanceBetween

};


console.log(
    "OCRA Video Analyzer: geometry.js cargado correctamente"
);