import * as THREE from 'three';

function main() {
    const canvas = document.querySelector('#main_canvas');
    // Takes data and renders onto canvas
    const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });

    // Camera setup
    const fov    = 75;
    const aspect = 2;
    const near   = 0.1;
    const far    = 1000;
    const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.position.z = 15;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#192633');
    // {
    //     const color = 0x192633;
    //     const near  = 10;
    //     const far   = 100;
    //     scene.fog = new THREE.Fog(color, near, far);
    // }

    // Light setup
    const color = 0xFFFFFF;
    const intensity = 1;
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(-1, 2, 4);
    scene.add(light);

    // Sphere setup
    const sphere_geometry = new THREE.SphereGeometry(0.9, 75, 75);
    const sphere = createMesh(sphere_geometry, 0xFF9B2A, scene, {});

    // Floor setup
    const floor_geometry = new THREE.PlaneGeometry(100, 100);
    const floor_data = {
        z: -5,
        y: -1,
        rotX: -Math.PI/3
    };
    const floor = createMesh(floor_geometry, 0xFFFFFF, scene, floor_data);

    /**
     * Creates a mesh and adds to a scene with optional position and rotation data.
     * 
     * @param {THREE.Geometry} geometry - Any type of Three.js geometry.
     * @param {HEX} color - As HEX, e.g. 0xFFFFFF.
     * @param {THREE.Scene} scene - The Three.js scene object to add the mesh to.
     * @param {Object} data - Position and rotation data, defaults to 0 
     * for all if empty obj is provided.
     * 
     * @returns the created mesh object.
     */
    function createMesh(
        geometry, 
        color,
        scene, 
        {x = 0, y = 0, z = 0, rotX = 0, rotY = 0, rotZ = 0}
    ) {
        const material = new THREE.MeshPhongMaterial({ color });
        const mesh = new THREE.Mesh(geometry, material);
        
        // Check for empty obj
        if (Object.keys(arguments[3]).length > 0) {   
            mesh.position.x = x;
            mesh.position.y = y;
            mesh.position.z = z;
            mesh.rotation.x = rotX;
            mesh.rotation.y = rotY;
            mesh.rotation.z = rotZ;
        }
        
        scene.add(mesh);

        return mesh;
    }

    /**
     * Resizes canvas if needed, fixes blocky rendering issues.
     * 
     * @param {THREE.WebGLRenderer} renderer - The Three.js renderer object.
     * @returns 'true' if canvas was resized, else 'false'.
     */
    function resizeRendererToDisplaySize(renderer) {
        const canvas = renderer.domElement;
        const width  = canvas.clientWidth;
        const height = canvas.clientHeight;
        const needResize = canvas.width !== width || canvas.height !== height;
        if (needResize) {
            renderer.setSize(width, height, false);
        }

        return needResize;
    }

    /**
     * Recursively renders the scene,
     * updates camera aspect with screen changes.
     */
    function render() {
        sphere.rotation.x -= 0.010; // Temp
        sphere.rotation.y -= 0.010; // Temp

        // Camera only needs to be updated if canvas size is changed
        if (resizeRendererToDisplaySize(renderer)) {   
            const canvas = renderer.domElement;
            camera.aspect = canvas.clientWidth / canvas.clientHeight;
            camera.updateProjectionMatrix();
        }

        renderer.render(scene, camera);

        requestAnimationFrame(render)
    }

    requestAnimationFrame(render)
}

main();