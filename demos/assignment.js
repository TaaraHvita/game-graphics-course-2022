import PicoGL from "../node_modules/picogl/build/module/picogl.js";
import {mat4, vec3, mat3, vec4, vec2} from "../node_modules/gl-matrix/esm/index.js";

import {positions, normals, indices} from "../blender/cube.js"
import {positions as planePositions, uvs as planeUvs, indices as planeIndices} from "../blender/plane.js"


// TEXTURING DEMO
let fragmentShader = `
    #version 300 es
    precision highp float;
    
    uniform sampler2D tex;    
    
    in vec3 vNormal;
    in vec3 viewDir;
    in vec2 v_uv;
    
    out vec4 outColor;
    
    void main()
    {        
        vec3 reflectedDir = reflect(viewDir, normalize(vNormal));
        outColor = texture(tex, v_uv, cubemap, reflectedDir);
    }
`;

let mirrorFragmentShader = `
    #version 300 es
    precision highp float;
    
    uniform sampler2D reflectionTex;
    uniform sampler2D distortionMap;
    uniform vec2 screenSize;
    
    in vec2 vUv;        
        
    out vec4 outColor;
    
    void main()
    {                        
        vec2 screenPos = gl_FragCoord.xy / screenSize;
        
        // 0.03 is a mirror distortion factor, try making a larger distortion         
        screenPos.x += (texture(distortionMap, vUv).r - 0.5) * 0.03;
        outColor = texture(reflectionTex, screenPos);
    }
`;

let mirrorVertexShader = `
    #version 300 es
            
    uniform mat4 modelViewProjectionMatrix;
    
    layout(location=0) in vec4 position;   
    layout(location=1) in vec2 uv;
    
    out vec2 vUv;
        
    void main()
    {
        vUv = uv;
        vec4 pos = position;
        pos.xz *= 2.0;
        gl_Position = modelViewProjectionMatrix * pos;
    }
`;


let vertexShader = `
    #version 300 es
            
    uniform mat4 modelViewProjectionMatrix;
    uniform mat4 modelMatrix;
    uniform mat3 normalMatrix;
    uniform vec3 cameraPosition;
    
    layout(location=0) in vec3 position;
    layout(location=1) in vec3 normal;
    layout(location=2) in vec2 uv;
        
    out vec2 v_uv;
    out vec3 vNormal;
    out vec3 viewDir;
    
    void main()
    {
        gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);           
        v_uv = uv;
        viewDir = (modelMatrix * position).xyz - cameraPosition;                
        vNormal = normalMatrix * normal;
    }
`;

let skyboxFragmentShader = `
    #version 300 es
    precision mediump float;
    
    uniform samplerCube cubemap;
    uniform mat4 viewProjectionInverse;
    in vec4 v_position;
    
    out vec4 outColor;
    
    void main() {
      vec4 t = viewProjectionInverse * v_position;
      outColor = texture(cubemap, normalize(t.xyz / t.w));
    }
`;

let skyboxVertexShader = `
    #version 300 es
    
    layout(location=0) in vec4 position;
    out vec4 v_position;
    
    void main() {
      v_position = position;
      gl_Position = position;
    }
`;
app.enable(PicoGL.CULL_FACE);

let program = app.createProgram(vertexShader.trim(), fragmentShader.trim());
let skyboxProgram = app.createProgram(skyboxVertexShader.trim(), skyboxFragmentShader.trim());
let mirrorProgram = app.createProgram(mirrorVertexShader, mirrorFragmentShader);

let vertexArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, positions))
    .vertexAttributeBuffer(2, app.createVertexBuffer(PicoGL.FLOAT, 2, uvs))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, indices));

let skyboxArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, planePositions))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, planeIndices));

let projMatrix = mat4.create();
let viewMatrix = mat4.create();
let viewProjMatrix = mat4.create();
let modelMatrix = mat4.create();
let modelViewMatrix = mat4.create();
let modelViewProjectionMatrix = mat4.create();
let rotateXMatrix = mat4.create();
let rotateYMatrix = mat4.create();
let skyboxViewProjectionInverse = mat4.create();


function calculateSurfaceReflectionMatrix(reflectionMat, mirrorModelMatrix, surfaceNormal) {
    let normal = vec3.transformMat3(vec3.create(), surfaceNormal, mat3.normalFromMat4(mat3.create(), mirrorModelMatrix));
    let pos = mat4.getTranslation(vec3.create(), mirrorModelMatrix);
    let d = -vec3.dot(normal, pos);
    let plane = vec4.fromValues(normal[0], normal[1], normal[2], d);

    reflectionMat[0] = (1 - 2 * plane[0] * plane[0]);
    reflectionMat[4] = ( - 2 * plane[0] * plane[1]);
    reflectionMat[8] = ( - 2 * plane[0] * plane[2]);
    reflectionMat[12] = ( - 2 * plane[3] * plane[0]);

    reflectionMat[1] = ( - 2 * plane[1] * plane[0]);
    reflectionMat[5] = (1 - 2 * plane[1] * plane[1]);
    reflectionMat[9] = ( - 2 * plane[1] * plane[2]);
    reflectionMat[13] = ( - 2 * plane[3] * plane[1]);

    reflectionMat[2] = ( - 2 * plane[2] * plane[0]);
    reflectionMat[6] = ( - 2 * plane[2] * plane[1]);
    reflectionMat[10] = (1 - 2 * plane[2] * plane[2]);
    reflectionMat[14] = ( - 2 * plane[3] * plane[2]);

    reflectionMat[3] = 0;
    reflectionMat[7] = 0;
    reflectionMat[11] = 0;
    reflectionMat[15] = 1;

    return reflectionMat;
}

async function loadTexture(fileName) {
    return await createImageBitmap(await (await fetch("images/" + fileName)).blob());
}

const tex = await loadTexture("ivo.png");
let drawCall = app.createDrawCall(program, vertexArray)
    .texture("tex", app.createTexture2D(tex, tex.width, tex.height, {
        magFilter: PicoGL.LINEAR,
        minFilter: PicoGL.LINEAR_MIPMAP_LINEAR,
        maxAnisotropy: 10,
        wrapS: PicoGL.REPEAT,
        wrapT: PicoGL.REPEAT
    }));

let skyboxDrawCall = app.createDrawCall(skyboxProgram, skyboxArray)
    .texture("cubemap", app.createCubemap({
        negX: await loadTexture("galaxylf.png"),
        posX: await loadTexture("galaxyrt.png"),
        negY: await loadTexture("galaxydn.png"),
        posY: await loadTexture("galaxyup.png"),
        negZ: await loadTexture("galaxyft.png"),
        posZ: await loadTexture("galaxybk.png")
    }));

let mirrorDrawCall = app.createDrawCall(mirrorProgram, mirrorArray)
    .texture("reflectionTex", reflectionColorTarget)
    .texture("distortionMap", app.createTexture2D(await loadTexture("noise.png")));


function renderReflectionTexture()
{
    app.drawFramebuffer(reflectionBuffer);
    app.viewport(0, 0, reflectionColorTarget.width, reflectionColorTarget.height);
    app.gl.cullFace(app.gl.FRONT);

    let reflectionMatrix = calculateSurfaceReflectionMatrix(mat4.create(), mirrorModelMatrix, vec3.fromValues(0, 1, 0));
    let reflectionViewMatrix = mat4.mul(mat4.create(), viewMatrix, reflectionMatrix);
    let reflectionCameraPosition = vec3.transformMat4(vec3.create(), cameraPosition, reflectionMatrix);
    drawObjects(reflectionCameraPosition, reflectionViewMatrix);

    app.gl.cullFace(app.gl.BACK);
    app.defaultDrawFramebuffer();
    app.defaultViewport();
}

function drawObjects(cameraPosition, viewMatrix) {
    mat4.multiply(viewProjMatrix, projMatrix, viewMatrix);

    mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
    mat4.multiply(modelViewProjectionMatrix, viewProjMatrix, modelMatrix);

    let skyboxViewProjectionMatrix = mat4.create();
    mat4.mul(skyboxViewProjectionMatrix, projMatrix, viewMatrix);
    mat4.invert(skyboxViewProjectionInverse, skyboxViewProjectionMatrix);

    app.clear();

    app.disable(PicoGL.DEPTH_TEST);
    app.disable(PicoGL.CULL_FACE);
    skyboxDrawCall.uniform("viewProjectionInverse", skyboxViewProjectionInverse);
    skyboxDrawCall.draw();

    app.enable(PicoGL.DEPTH_TEST);
    app.enable(PicoGL.CULL_FACE);
    drawCall.uniform("modelViewProjectionMatrix", modelViewProjectionMatrix);
    drawCall.uniform("cameraPosition", cameraPosition);
    drawCall.uniform("modelMatrix", modelMatrix);
    drawCall.uniform("normalMatrix", mat3.normalFromMat4(mat3.create(), modelMatrix));
    drawCall.draw();
}

function drawMirror() {
    mat4.multiply(mirrorModelViewProjectionMatrix, viewProjMatrix, mirrorModelMatrix);
    mirrorDrawCall.uniform("modelViewProjectionMatrix", mirrorModelViewProjectionMatrix);
    mirrorDrawCall.uniform("screenSize", vec2.fromValues(app.width, app.height))
    mirrorDrawCall.draw();
}
    

function draw(timems) {
    let time = timems * 0.001;

    mat4.perspective(projMatrix, Math.PI / 2, app.width / app.height, 0.1, 100.0);
    let camPos = vec3.rotateY(vec3.create(), vec3.fromValues(0, 0.5, 2), vec3.fromValues(0, 0, 0), time * 0.05);
    mat4.lookAt(viewMatrix, camPos, vec3.fromValues(0, 0, 0), vec3.fromValues(0, 1, 0));
    mat4.multiply(viewProjMatrix, projMatrix, viewMatrix);

    mat4.fromXRotation(rotateXMatrix, time * 0.1136);
    mat4.fromZRotation(rotateYMatrix, time * 0.2235);
    mat4.multiply(modelMatrix, rotateXMatrix, rotateYMatrix);

    mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
    mat4.multiply(modelViewProjectionMatrix, viewProjMatrix, modelMatrix);

    let skyboxViewProjectionMatrix = mat4.create();
    mat4.mul(skyboxViewProjectionMatrix, projMatrix, viewMatrix);
    mat4.invert(skyboxViewProjectionInverse, skyboxViewProjectionMatrix);

    app.clear();

    app.disable(PicoGL.DEPTH_TEST);
    skyboxDrawCall.uniform("viewProjectionInverse", skyboxViewProjectionInverse);
    skyboxDrawCall.draw();

    app.enable(PicoGL.DEPTH_TEST);
    drawCall.uniform("modelViewProjectionMatrix", modelViewProjectionMatrix);
    drawCall.draw();

    renderReflectionTexture();
    drawObjects(cameraPosition, viewMatrix);
    drawMirror();

    requestAnimationFrame(draw);
}
requestAnimationFrame(draw);