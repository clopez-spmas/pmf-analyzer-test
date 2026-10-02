"use strict";

/*
=========================================================
OCRA VIDEO ANALYZER
Archivo: markerMapping.js

MAPPING DE MARCADORES KINOVEA → 24 PUNTOS ANATÓMICOS

Los 24 puntos se obtienen exclusivamente de catalog.js.
Los puntos virtuales NO se asignan a marcadores.

Cada vídeo mantiene su mapping independiente.
=========================================================
*/

const MARKER_MAPPING_MAX_VIDEOS = 12;


/* =====================================================
   CATÁLOGO MAESTRO
===================================================== */

const anatomicalPoints =
    window.AnatomicalPoints || {};


if (
    Object.keys(anatomicalPoints).length !== 24
) {

    console.warn(
        "markerMapping.js: se esperaban 24 puntos anatómicos reales; encontrados:",
        Object.keys(anatomicalPoints).length
    );

}


/* =====================================================
   CREAR MAPPING VACÍO
===================================================== */

function createEmptyMarkerMapping() {

    const mapping = {};

    Object.keys(anatomicalPoints).forEach(
        key => {
            mapping[key] = null;
        }
    );

    return mapping;
}


/* =====================================================
   MAPPINGS INDEPENDIENTES POR VÍDEO
===================================================== */

const markerMappings = [];

for (
    let i = 0;
    i < MARKER_MAPPING_MAX_VIDEOS;
    i++
) {

    markerMappings.push(
        createEmptyMarkerMapping()
    );

}

let markerMapping = markerMappings[0];


function isValidVideoIndex(videoIndex) {

    const index = Number(videoIndex);

    return (
        Number.isInteger(index) &&
        index >= 0 &&
        index < MARKER_MAPPING_MAX_VIDEOS
    );
}


function getMarkerMapping(videoIndex = 0) {

    const index = Number(videoIndex);

    if (!isValidVideoIndex(index)) {
        return null;
    }

    return {
        ...markerMappings[index]
    };
}


function resetMarkerMapping(videoIndex = 0) {

    const index = Number(videoIndex);

    if (!isValidVideoIndex(index)) {
        return false;
    }

    markerMappings[index] =
        createEmptyMarkerMapping();

    if (index === 0) {
        markerMapping = markerMappings[0];
    }

    return true;
}


function resetAllMarkerMappings() {

    for (
        let i = 0;
        i < MARKER_MAPPING_MAX_VIDEOS;
        i++
    ) {
        markerMappings[i] =
            createEmptyMarkerMapping();
    }

    markerMapping = markerMappings[0];

    return true;
}


/* =====================================================
   CARGAR / GUARDAR
===================================================== */

function loadMarkerMapping(mapping, videoIndex = 0) {

    const index = Number(videoIndex);

    if (!isValidVideoIndex(index)) {
        return null;
    }

    resetMarkerMapping(index);

    if (
        !mapping ||
        typeof mapping !== "object"
    ) {
        return getMarkerMapping(index);
    }

    Object.keys(anatomicalPoints).forEach(
        joint => {

            if (
                !Object.prototype.hasOwnProperty.call(
                    mapping,
                    joint
                )
            ) {
                return;
            }

            const value = mapping[joint];

            if (
                value === null ||
                value === undefined
            ) {
                return;
            }

            const normalized =
                String(value).trim();

            if (normalized !== "") {
                markerMappings[index][joint] = normalized;
            }
        }
    );

    if (index === 0) {
        markerMapping = markerMappings[0];
    }

    return getMarkerMapping(index);
}


function saveMarkerMapping(videoIndex = 0) {

    return getMarkerMapping(videoIndex);
}


/* =====================================================
   ASIGNACIÓN
===================================================== */

function mapMarkerToJoint(
    joint,
    markerName,
    videoIndex = 0
) {

    const index = Number(videoIndex);

    if (!isValidVideoIndex(index)) {
        throw new Error(
            "Índice de vídeo no válido: " + videoIndex
        );
    }

    if (
        !Object.prototype.hasOwnProperty.call(
            anatomicalPoints,
            joint
        )
    ) {
        throw new Error(
            "Punto anatómico no válido: " + joint
        );
    }

    const mapping = markerMappings[index];

    let normalizedMarker = null;

    if (
        markerName !== null &&
        markerName !== undefined
    ) {

        normalizedMarker =
            String(markerName).trim();

        if (normalizedMarker === "") {
            normalizedMarker = null;
        }
    }

    /* Un marcador Kinovea solo puede representar
       un punto anatómico dentro del mismo vídeo. */

    Object.keys(mapping).forEach(
        existingJoint => {

            if (
                existingJoint !== joint &&
                normalizedMarker !== null &&
                mapping[existingJoint] === normalizedMarker
            ) {
                mapping[existingJoint] = null;
            }
        }
    );

    mapping[joint] = normalizedMarker;

    if (index === 0) {
        markerMapping = markerMappings[0];
    }

    return saveMarkerMapping(index);
}


/* =====================================================
   POSICIONES
===================================================== */

function getJointPosition(
    frame,
    joint,
    videoIndex = 0
) {

    if (!frame || !joint) {
        return null;
    }

    const index = Number(videoIndex);

    if (!isValidVideoIndex(index)) {
        return null;
    }

    if (
        !Object.prototype.hasOwnProperty.call(
            anatomicalPoints,
            joint
        )
    ) {
        return null;
    }

    const markerName =
        markerMappings[index][joint];

    if (
        markerName === null ||
        markerName === undefined ||
        String(markerName).trim() === ""
    ) {
        return null;
    }

    const landmarks = frame.landmarks;

    if (
        !landmarks ||
        typeof landmarks !== "object"
    ) {
        return null;
    }

    const point = landmarks[markerName];

    if (!point) {
        return null;
    }

    const x = Number(point.x);
    const y = Number(point.y);

    if (
        !Number.isFinite(x) ||
        !Number.isFinite(y)
    ) {
        return null;
    }

    return { x, y };
}


function getAllJointPositions(
    frame,
    videoIndex = 0
) {

    const positions = {};

    Object.keys(anatomicalPoints).forEach(
        joint => {

            const position =
                getJointPosition(
                    frame,
                    joint,
                    videoIndex
                );

            if (position) {
                positions[joint] = position;
            }
        }
    );

    return positions;
}


/* =====================================================
   INTERFAZ DE MAPPING
===================================================== */

function escapeMarkerText(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getMarkerName(marker) {

    if (
        marker === null ||
        marker === undefined
    ) {
        return "";
    }

    if (
        typeof marker === "string" ||
        typeof marker === "number"
    ) {
        return String(marker).trim();
    }

    if (typeof marker === "object") {

        const candidates = [
            marker.name,
            marker.label,
            marker.id,
            marker.markerName,
            marker.title
        ];

        for (const candidate of candidates) {

            if (
                candidate !== null &&
                candidate !== undefined &&
                String(candidate).trim() !== ""
            ) {
                return String(candidate).trim();
            }
        }
    }

    return "";
}


const MAPPING_GROUPS = [

    {
        label: "Cabeza y cuello",
        keys: [
            "head_front",
            "head_back",
            "right_ear",
            "left_ear",
            "neck"
        ]
    },

    {
        label: "Tronco",
        keys: [
            "right_shoulder",
            "left_shoulder",
            "right_hip",
            "left_hip"
        ]
    },

    {
        label: "Extremidades inferiores",
        keys: [
            "right_knee",
            "left_knee",
            "right_ankle",
            "left_ankle",
            "right_foot",
            "left_foot"
        ]
    }
]


function createMarkerMappingSection(
    markers,
    videoIndex
) {

    const index = Number(videoIndex);

    if (!isValidVideoIndex(index)) {
        return "";
    }

    if (!Array.isArray(markers)) {
        return "";
    }

    let html = `
        <div class="marker-mapping-dialog" data-video-index="${index}">
            <h3>Vídeo ${index + 1}</h3>
            <p>
                Seleccione qué marcador Kinovea corresponde
                a cada punto anatómico.
            </p>
            <p>
                No es necesario asignar todos los puntos.
                Solo se utilizarán los marcadores disponibles
                en este vídeo.
            </p>
    `;

    if (markers.length === 0) {

        return html + `
            <p>Este vídeo no contiene marcadores.</p>
        </div>`;
    }

    markers.forEach(marker => {

        const markerName = getMarkerName(marker);

        if (!markerName) {
            return;
        }

        html += `
            <div class="marker-row">
                <label>
                    ${escapeMarkerText(markerName)}
                </label>
                <select
                    data-marker="${escapeMarkerText(markerName)}"
                    data-video-index="${index}"
                    class="marker-joint-select"
                >
                    <option value="">-- no asignar --</option>
        `;

        MAPPING_GROUPS.forEach(group => {

            html += `
                <optgroup label="${escapeMarkerText(group.label)}">
            `;

            group.keys.forEach(key => {

                if (
                    !Object.prototype.hasOwnProperty.call(
                        anatomicalPoints,
                        key
                    )
                ) {
                    return;
                }

                html += `
                    <option value="${escapeMarkerText(key)}">
                        ${escapeMarkerText(anatomicalPoints[key].name)}
                    </option>
                `;
            });

            html += `</optgroup>`;
        });

        html += `
                </select>
            </div>
        `;
    });

    return html + `</div>`;
}


function updateMappingSelects(videoIndex) {

    const index = Number(videoIndex);

    if (!isValidVideoIndex(index)) {
        return;
    }

    const target =
        document.getElementById(
            "markerMappingContainer"
        );

    if (!target) {
        return;
    }

    const mapping = markerMappings[index];

    target
        .querySelectorAll(
            `.marker-joint-select[data-video-index="${index}"]`
        )
        .forEach(select => {

            const marker = select.dataset.marker;
            let assignedJoint = "";

            Object.keys(mapping).forEach(joint => {

                if (mapping[joint] === marker) {
                    assignedJoint = joint;
                }
            });

            select.value = assignedJoint;
        });
}


function updateMarkerMapping(select, videoIndex = 0) {

    if (!select) {
        return;
    }

    const marker = select.dataset.marker;
    const joint = select.value;

    if (
        marker === undefined ||
        marker === null ||
        String(marker).trim() === ""
    ) {
        return;
    }

    const index = Number(videoIndex);

    if (!isValidVideoIndex(index)) {
        return;
    }

    if (!joint) {

        const mapping = markerMappings[index];

        Object.keys(mapping).forEach(key => {
            if (mapping[key] === marker) {
                mapping[key] = null;
            }
        });

    } else {

        mapMarkerToJoint(
            joint,
            marker,
            index
        );
    }

    updateMappingSelects(index);
}


/* =====================================================
   VALIDACIÓN
===================================================== */

function validateMarkerMapping(videoIndex = 0) {

    const index = Number(videoIndex);

    if (!isValidVideoIndex(index)) {
        return {
            valid: false,
            assigned: 0
        };
    }

    const assignedMarkers =
        Object.values(markerMappings[index])
            .filter(value =>
                value !== null &&
                value !== undefined &&
                String(value).trim() !== ""
            );

    return {
        valid: assignedMarkers.length > 0,
        assigned: assignedMarkers.length
    };
}


function validateAllMarkerMappings(videoCount) {

    const count = Number(videoCount);
    const results = [];

    if (
        !Number.isInteger(count) ||
        count < 1 ||
        count > MARKER_MAPPING_MAX_VIDEOS
    ) {
        return results;
    }

    for (let i = 0; i < count; i++) {

        results.push({
            videoIndex: i,
            videoNumber: i + 1,
            ...validateMarkerMapping(i)
        });
    }

    return results;
}


/* =====================================================
   INTERFAZ DE TODOS LOS VÍDEOS
===================================================== */

function createAllMarkerMappingUI(videoMarkers) {

    return new Promise((resolve, reject) => {

        const container =
            document.getElementById(
                "markerMappingContainer"
            );

        if (!container) {
            reject(new Error(
                "No existe #markerMappingContainer en index.html."
            ));
            return;
        }

        if (
            !Array.isArray(videoMarkers) ||
            videoMarkers.length < 1 ||
            videoMarkers.length > MARKER_MAPPING_MAX_VIDEOS
        ) {
            reject(new Error(
                "El número de vídeos debe estar entre 1 y 12."
            ));
            return;
        }

        resetAllMarkerMappings();

        let html = `
            <div class="all-marker-mapping">
                <h3>Asignación de marcadores</h3>
                <p>
                    Configure cada vídeo de forma independiente.
                </p>
        `;

        videoMarkers.forEach((markers, videoIndex) => {
            html += createMarkerMappingSection(
                markers,
                videoIndex
            );
        });

        html += `
                <div class="mapping-buttons">
                    <button
                        id="cancelAllMappingButton"
                        type="button"
                    >
                        Cancelar
                    </button>
                    <button
                        id="confirmAllMappingButton"
                        type="button"
                    >
                        Confirmar marcadores
                    </button>
                </div>
            </div>
        `;

        container.innerHTML = html;

        container
            .querySelectorAll(".marker-joint-select")
            .forEach(select => {

                select.addEventListener(
                    "change",
                    function () {
                        updateMarkerMapping(
                            this,
                            Number(this.dataset.videoIndex)
                        );
                    }
                );
            });

        const cancelButton =
            document.getElementById(
                "cancelAllMappingButton"
            );

        if (cancelButton) {

            cancelButton.addEventListener(
                "click",
                () => {

                    resetAllMarkerMappings();
                    container.innerHTML = "";

                    reject(new Error(
                        "Asignación de marcadores cancelada."
                    ));
                }
            );
        }

        const confirmButton =
            document.getElementById(
                "confirmAllMappingButton"
            );

        if (confirmButton) {

            confirmButton.addEventListener(
                "click",
                () => {

                    const validations =
                        validateAllMarkerMappings(
                            videoMarkers.length
                        );

                    const invalidVideos =
                        validations.filter(
                            item => !item.valid
                        );

                    if (invalidVideos.length > 0) {

                        const videoNumbers =
                            invalidVideos
                                .map(item =>
                                    `Vídeo ${item.videoNumber}`
                                )
                                .join(", ");

                        alert(
                            "Debe asignar al menos un marcador en: " +
                            videoNumbers + "."
                        );

                        return;
                    }

                    const mappings = [];

                    for (
                        let i = 0;
                        i < videoMarkers.length;
                        i++
                    ) {
                        mappings.push(
                            saveMarkerMapping(i)
                        );
                    }

                    container.innerHTML = "";

                    resolve(mappings);
                }
            );
        }
    });
}


/* =====================================================
   INTERFAZ DE UN SOLO VÍDEO
===================================================== */

function createMarkerMappingUI(
    markers,
    videoIndex = 0
) {

    const index = Number(videoIndex);

    if (!isValidVideoIndex(index)) {
        return Promise.reject(new Error(
            "Índice de vídeo no válido."
        ));
    }

    resetMarkerMapping(index);

    return new Promise((resolve, reject) => {

        const container =
            document.getElementById(
                "markerMappingContainer"
            );

        if (!container) {
            reject(new Error(
                "No existe #markerMappingContainer en index.html."
            ));
            return;
        }

        if (!Array.isArray(markers)) {
            reject(new Error(
                "Lista de marcadores inválida."
            ));
            return;
        }

        let html =
            createMarkerMappingSection(
                markers,
                index
            );

        html += `
            <div class="mapping-buttons">
                <button
                    id="cancelMappingButton"
                    type="button"
                >
                    Cancelar
                </button>
                <button
                    id="confirmMappingButton"
                    type="button"
                >
                    Analizar
                </button>
            </div>
        `;

        container.innerHTML = html;

        container
            .querySelectorAll(".marker-joint-select")
            .forEach(select => {

                select.addEventListener(
                    "change",
                    function () {
                        updateMarkerMapping(
                            this,
                            index
                        );
                    }
                );
            });

        const cancelButton =
            document.getElementById(
                "cancelMappingButton"
            );

        if (cancelButton) {

            cancelButton.addEventListener(
                "click",
                () => {

                    resetMarkerMapping(index);
                    container.innerHTML = "";

                    reject(new Error(
                        "Asignación cancelada."
                    ));
                }
            );
        }

        const confirmButton =
            document.getElementById(
                "confirmMappingButton"
            );

        if (confirmButton) {

            confirmButton.addEventListener(
                "click",
                () => {

                    const validation =
                        validateMarkerMapping(index);

                    if (!validation.valid) {

                        alert(
                            `Debe asignar al menos un marcador en el Vídeo ${index + 1}.`
                        );

                        return;
                    }

                    const mapping =
                        saveMarkerMapping(index);

                    container.innerHTML = "";
                    resolve(mapping);
                }
            );
        }
    });
}


/* =====================================================
   EXPORTACIÓN GLOBAL
===================================================== */

window.MarkerMapping = {
    anatomicalPoints,
    markerMappings,
    getMarkerMapping,
    loadMarkerMapping,
    saveMarkerMapping,
    resetMarkerMapping,
    resetAllMarkerMappings,
    mapMarkerToJoint,
    getJointPosition,
    getAllJointPositions,
    createMarkerMappingUI,
    createAllMarkerMappingUI,
    updateMarkerMapping,
    validateMarkerMapping,
    validateAllMarkerMappings
};

window.anatomicalPoints = anatomicalPoints;
window.markerMappings = markerMappings;
window.getMarkerMapping = getMarkerMapping;
window.saveMarkerMapping = saveMarkerMapping;
window.loadMarkerMapping = loadMarkerMapping;
window.resetMarkerMapping = resetMarkerMapping;
window.resetAllMarkerMappings = resetAllMarkerMappings;
window.mapMarkerToJoint = mapMarkerToJoint;
window.getJointPosition = getJointPosition;
window.getAllJointPositions = getAllJointPositions;
window.createMarkerMappingUI = createMarkerMappingUI;
window.createAllMarkerMappingUI = createAllMarkerMappingUI;
window.updateMarkerMapping = updateMarkerMapping;
window.validateMarkerMapping = validateMarkerMapping;
window.validateAllMarkerMappings = validateAllMarkerMappings;
window.MARKER_MAPPING_MAX_VIDEOS = MARKER_MAPPING_MAX_VIDEOS;

console.log(
    "OCRA Video Analyzer: markerMapping.js cargado correctamente",
    "| puntos anatómicos:",
    Object.keys(anatomicalPoints).length,
    "| vídeos máximos:",
    MARKER_MAPPING_MAX_VIDEOS
);