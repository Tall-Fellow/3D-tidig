import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function main() {
    const canvas = document.querySelector('#main_canvas');
    // Takes data and renders onto canvas
    const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });

    // Camera setup
    const fov    = 75;
    const aspect = 2;
    const near   = 0.1;
    const far    = 100;
    const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.position.z = 30;
    camera.up.set(0, 1, 0); // Set camera up direction, needed for lookAt()
    camera.lookAt(0, 0, 0); // Point camera towards origo

    // Controls setup
    const controls = new OrbitControls(camera, renderer.domElement);

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#192633');
    // {
    //     const color = 0x192633;
    //     const near  = 10;
    //     const far   = 50;
    //     scene.fog = new THREE.Fog(color, near, far);
    // }

    // Light setup
    const color = 0xFFFFFF;
    const intensity = 0.5;
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(-1, 2, 4);
    scene.add(light);

    // Orientation markers setup - Used for development
    {
        const X_geometry = new THREE.BoxGeometry(100, 0.1, 0.1);
        const Y_geometry = new THREE.BoxGeometry(0.1, 100, 0.1);
        const Z_geometry = new THREE.BoxGeometry(0.1, 0.1, 100);
        const X_material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const Y_material = new THREE.MeshBasicMaterial({ color: 0x08ff00 });
        const Z_material = new THREE.MeshBasicMaterial({ color: 0x0400ff });
        
        scene.add(new THREE.Mesh(X_geometry, X_material)); // X - red
        scene.add(new THREE.Mesh(Y_geometry, Y_material)); // Y - green
        scene.add(new THREE.Mesh(Z_geometry, Z_material)); // Z - blue
    }

    // Sphere setup
    const sphere_geometry = new THREE.SphereGeometry(4, 8, 8);
    const sphere_material = new THREE.MeshPhongMaterial({ emissive: 0xFF9B2A });
    const sphere = new THREE.Mesh(sphere_geometry, sphere_material);
    scene.add(sphere);

    // Card test
    const card_geometry = new THREE.PlaneGeometry(2, 3);
    const card_material = new THREE.MeshPhongMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide });
    const card = new THREE.Mesh(card_geometry, card_material);
    const card2 = new THREE.Mesh(card_geometry, card_material);
    const card3 = new THREE.Mesh(card_geometry, card_material);
    const card4 = new THREE.Mesh(card_geometry, card_material);
    card.position.x = 7;
    card2.position.x = -7;
    card3.position.z = 7;
    card4.position.z = -7;
    card.rotation.y = Math.PI/2;
    card2.rotation.y = Math.PI/2;
    card3.rotation.y = Math.PI/2;
    card4.rotation.y = Math.PI/2;
    sphere.add(card);
    sphere.add(card2);
    sphere.add(card3);
    sphere.add(card4);

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
    function render(time) {
        time *= 0.001;

        // Camera only needs to be updated if canvas size is changed
        if (resizeRendererToDisplaySize(renderer)) {   
            const canvas = renderer.domElement;
            camera.aspect = canvas.clientWidth / canvas.clientHeight;
            camera.updateProjectionMatrix();
        }

        sphere.rotation.y = time;
        card.rotation.y = -time;
        card2.rotation.y = -time;
        card3.rotation.y = -time;
        card4.rotation.y = -time;
        
        controls.update();
        
        renderer.render(scene, camera);

        requestAnimationFrame(render)
    }

    requestAnimationFrame(render)
}

main();