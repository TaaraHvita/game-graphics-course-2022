import PicoGL from "../node_modules/picogl/build/module/picogl.js";
import {mat4, vec3, mat3, vec4, vec2} from "../node_modules/gl-matrix/esm/index.js";

import {positions, normals, indices} from "../blender/.js"
import {positions as planePositions, uvs as planeUvs, indices as planeIndices} from "../blender/plane.js"


function draw(timems) {
    let time = timems / 1000;

    requestAnimationFrame(draw);
}
requestAnimationFrame(draw);