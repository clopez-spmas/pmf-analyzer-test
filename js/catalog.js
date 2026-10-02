"use strict";

const ANATOMICAL_POINTS = {
 head:{id:"head",name:"Cabeza",side:"center",region:"head"}, head_front:{id:"head_front",name:"Punto anterior de cabeza",side:"center",region:"head"}, head_back:{id:"head_back",name:"Punto posterior de cabeza",side:"center",region:"head"}, right_ear:{id:"right_ear",name:"Oreja derecha",side:"right",region:"head"}, left_ear:{id:"left_ear",name:"Oreja izquierda",side:"left",region:"head"}, neck:{id:"neck",name:"Cuello",side:"center",region:"neck"}, neck_base:{id:"neck_base",name:"Base del cuello / C7",side:"center",region:"neck"}, right_shoulder:{id:"right_shoulder",name:"Hombro derecho",side:"right",region:"upper_limb"}, left_shoulder:{id:"left_shoulder",name:"Hombro izquierdo",side:"left",region:"upper_limb"}, right_elbow:{id:"right_elbow",name:"Codo derecho",side:"right",region:"upper_limb"}, left_elbow:{id:"left_elbow",name:"Codo izquierdo",side:"left",region:"upper_limb"}, right_wrist:{id:"right_wrist",name:"Muñeca derecha",side:"right",region:"upper_limb"}, left_wrist:{id:"left_wrist",name:"Muñeca izquierda",side:"left",region:"upper_limb"}, right_index:{id:"right_index",name:"Índice derecho",side:"right",region:"hand"}, left_index:{id:"left_index",name:"Índice izquierdo",side:"left",region:"hand"}, pelvis:{id:"pelvis",name:"Pelvis",side:"center",region:"pelvis"}, right_hip:{id:"right_hip",name:"Cadera derecha",side:"right",region:"pelvis"}, left_hip:{id:"left_hip",name:"Cadera izquierda",side:"left",region:"pelvis"}, right_knee:{id:"right_knee",name:"Rodilla derecha",side:"right",region:"lower_limb"}, left_knee:{id:"left_knee",name:"Rodilla izquierda",side:"left",region:"lower_limb"}, right_ankle:{id:"right_ankle",name:"Tobillo derecho",side:"right",region:"lower_limb"}, left_ankle:{id:"left_ankle",name:"Tobillo izquierdo",side:"left",region:"lower_limb"}, right_foot:{id:"right_foot",name:"Pie derecho",side:"right",region:"foot"}, left_foot:{id:"left_foot",name:"Pie izquierdo",side:"left",region:"foot"}
};

const VIRTUAL_ANATOMICAL_POINTS = {
 V_SHOULDER_CENTER:{id:"V_SHOULDER_CENTER",name:"Centro virtual de hombros",virtual:true,source:["left_shoulder","right_shoulder"]},
 V_HIP_CENTER:{id:"V_HIP_CENTER",name:"Centro virtual de caderas",virtual:true,source:["left_hip","right_hip"]},
 V_HEAD_CENTER:{id:"V_HEAD_CENTER",name:"Centro virtual de cabeza",virtual:true,source:["head_front","head_back"]},
 V_NECK_BASE:{id:"V_NECK_BASE",name:"Base virtual del cuello",virtual:true,source:["neck_base"]}
};

const BIOMECHANICAL_CATALOG = {
 trunk_flexion:{name:"Flexión / extensión de tronco",type:"segment_angle",points:["V_HIP_CENTER","V_SHOULDER_CENTER"],plane:"sagittal",unit:"deg",thresholds:null},
 trunk_lateral:{name:"Inclinación lateral de tronco",type:"segment_angle",points:["V_HIP_CENTER","V_SHOULDER_CENTER"],plane:"frontal",unit:"deg",thresholds:null},
 trunk_axial_rotation:{name:"Rotación axial de tronco",type:"segment_angle",points:["left_shoulder","right_shoulder"],plane:"transverse_projection",unit:"deg",thresholds:null},
 neck_flexion:{name:"Flexión / extensión cervical",type:"angle",points:["V_HEAD_CENTER","neck","V_SHOULDER_CENTER"],plane:"sagittal",unit:"deg",thresholds:null},
 head_lateral:{name:"Lateralización de cabeza",type:"segment_angle",points:["neck","V_HEAD_CENTER"],plane:"frontal",unit:"deg",thresholds:null},
 head_axial_rotation:{name:"Rotación axial de cabeza",type:"segment_angle",points:["left_ear","right_ear"],plane:"transverse_projection",unit:"deg",thresholds:null},
 shoulder_flexion_left:{name:"Flexión hombro izquierdo",type:"angle",points:["left_elbow","left_shoulder","V_HIP_CENTER"],plane:"sagittal",unit:"deg",thresholds:null},
 shoulder_flexion_right:{name:"Flexión hombro derecho",type:"angle",points:["right_elbow","right_shoulder","V_HIP_CENTER"],plane:"sagittal",unit:"deg",thresholds:null},
 shoulder_abduction_left:{name:"Abducción hombro izquierdo",type:"angle",points:["left_elbow","left_shoulder","V_HIP_CENTER"],plane:"frontal",unit:"deg",thresholds:null},
 shoulder_abduction_right:{name:"Abducción hombro derecho",type:"angle",points:["right_elbow","right_shoulder","V_HIP_CENTER"],plane:"frontal",unit:"deg",thresholds:null},
 elbow_flexion_left:{name:"Flexión codo izquierdo",type:"angle",points:["left_shoulder","left_elbow","left_wrist"],plane:"sagittal",unit:"deg",thresholds:null},
 elbow_flexion_right:{name:"Flexión codo derecho",type:"angle",points:["right_shoulder","right_elbow","right_wrist"],plane:"sagittal",unit:"deg",thresholds:null},
 wrist_flexion_left:{name:"Flexión muñeca izquierda",type:"angle",points:["left_elbow","left_wrist","left_index"],plane:"sagittal",unit:"deg",thresholds:null},
 wrist_flexion_right:{name:"Flexión muñeca derecha",type:"angle",points:["right_elbow","right_wrist","right_index"],plane:"sagittal",unit:"deg",thresholds:null},
 wrist_deviation_left:{name:"Desviación radial/cubital muñeca izquierda",type:"angle",points:["left_elbow","left_wrist","left_index"],plane:"frontal",unit:"deg",thresholds:null},
 wrist_deviation_right:{name:"Desviación radial/cubital muñeca derecha",type:"angle",points:["right_elbow","right_wrist","right_index"],plane:"frontal",unit:"deg",thresholds:null},
 knee_flexion_left:{name:"Flexión rodilla izquierda",type:"angle",points:["left_hip","left_knee","left_ankle"],plane:"sagittal",unit:"deg",thresholds:null},
 knee_flexion_right:{name:"Flexión rodilla derecha",type:"angle",points:["right_hip","right_knee","right_ankle"],plane:"sagittal",unit:"deg",thresholds:null},
 ankle_left:{name:"Movimiento tobillo izquierdo",type:"angle",points:["left_knee","left_ankle","left_foot"],plane:"sagittal",unit:"deg",thresholds:null},
 ankle_right:{name:"Movimiento tobillo derecho",type:"angle",points:["right_knee","right_ankle","right_foot"],plane:"sagittal",unit:"deg",thresholds:null}
};

window.AnatomicalPoints=ANATOMICAL_POINTS;
window.VirtualAnatomicalPoints=VIRTUAL_ANATOMICAL_POINTS;
window.BIOMECHANICAL_CATALOG=BIOMECHANICAL_CATALOG;
window.BiomechanicalCatalog=BIOMECHANICAL_CATALOG;
window.CATALOG=BIOMECHANICAL_CATALOG;
