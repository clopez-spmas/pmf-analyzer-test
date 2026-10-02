"use strict";

/*
=========================================================
KINOVEA JSON CONVERTER
Compatible con Kinovea 2024.1.1

Formato soportado:

data.timeseries[]
    name
    time[]
    data["0"][
        [x,y],
        [x,y],
        ...
    ]

Salida:

{
    source,
    fps,
    duration,
    markers,
    frames:[
        {
            index,
            time,
            landmarks:{
                "Marcador 1":{
                    x,
                    y
                }
            }
        }
    ]
}

=========================================================
*/


function parseKinoveaJSON(json) {


    if (!json) {

        throw new Error(
            "JSON vacío"
        );

    }



    if (!json.metadata) {

        throw new Error(
            "No existe metadata de Kinovea"
        );

    }



    if (!json.data) {

        throw new Error(
            "No existe bloque data"
        );

    }



    const metadata =
        json.metadata;


    const data =
        json.data;



    /*
    =====================================================
    Información del vídeo
    =====================================================
    */


    const fps =
        metadata.captureFramerate ??
        metadata.userFramerate ??
        null;



    const imageSize =
        metadata.imageSize ??
        {
            width:null,
            height:null
        };





    /*
    =====================================================
    Obtener series temporales
    =====================================================
    */


    const timeseries =
        Array.isArray(
            data.timeseries
        )
        ?
        data.timeseries
        :
        [];




    if (timeseries.length === 0) {


        throw new Error(
            "No existen timeseries en el JSON"
        );


    }





    /*
    =====================================================
    Marcadores
    =====================================================
    */


    const markers =
        timeseries.map(
            item => item.name
        );





    /*
    =====================================================
    Número de frames
    =====================================================
    */


    const frameCount =
        Math.max(
            ...timeseries.map(
                series =>
                    series.time
                    ?
                    series.time.length
                    :
                    0
            )
        );





    /*
    =====================================================
    Construcción de frames
    =====================================================
    */


    const frames = [];




    for (
        let frameIndex = 0;
        frameIndex < frameCount;
        frameIndex++
    ) {


        const landmarks = {};



        let frameTime = null;




        timeseries.forEach(
            series => {



                /*
                -----------------------------------------
                Tiempo
                -----------------------------------------
                */


                if (
                    frameTime === null &&
                    series.time &&
                    series.time[frameIndex]
                    !== undefined
                ) {

                    frameTime =
                        series.time[frameIndex];

                }





                let point = null;



                /*
                -----------------------------------------
                Formato Kinovea 2024.1.1
                data["0"][frame]
                -----------------------------------------
                */


                if (
                    series.data &&
                    series.data["0"] &&
                    series.data["0"][frameIndex]
                ) {


                    point =
                        series.data["0"]
                        [frameIndex];


                }




                /*
                -----------------------------------------
                Compatibilidad formatos alternativos
                -----------------------------------------
                */


                if (
                    !point &&
                    series.x &&
                    series.y
                ) {


                    point = [

                        series.x[frameIndex],

                        series.y[frameIndex]

                    ];


                }





                if (
                    point &&
                    point.length >= 2
                ) {


                    landmarks[
                        series.name
                    ] = {


                        x:
                            Number(point[0]),


                        y:
                            Number(point[1])


                    };


                }
                else {


                    landmarks[
                        series.name
                    ] = null;


                }




            }
        );





        frames.push({

            index:
                frameIndex,


            time:
                frameTime,


            landmarks


        });



    }







    /*
    =====================================================
    Duración
    =====================================================
    */


    const duration =
        frames.length > 0
        ?
        frames[
            frames.length - 1
        ].time
        :
        0;







    /*
    =====================================================
    Resultado final
    =====================================================
    */


    return {


        source:
            metadata.producer
            ??
            "Kinovea",



        originalFilename:
            metadata.originalFilename
            ??
            null,



        fps,



        duration,



        imageSize,



        markers,



        frameCount,



        frames


    };


}







/*
=========================================================
Resumen Kinovea
=========================================================
*/


function getKinoveaSummary(json) {


    const result =
        parseKinoveaJSON(
            json
        );



    return {


        source:
            result.source,


        filename:
            result.originalFilename,


        fps:
            result.fps,


        resolution:
            result.imageSize.width
            +
            "x"
            +
            result.imageSize.height,



        markers:
            result.markers.length,



        frames:
            result.frameCount,



        duration:
            result.duration


    };


}

