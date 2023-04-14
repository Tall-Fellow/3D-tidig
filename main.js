import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class CardMesh extends THREE.Mesh {
    constructor(geometry, material, max_speed, allowed_deviation) {
        super(geometry, material);
        this.orgPosY           = this.position.y;
        this.allowed_deviation = allowed_deviation;
        this.max_speed         = max_speed;
        this.speed             = max_speed * Math.random();
        this._setDirection(0.5);
    }

    _setDirection(chance = 0.005) {
        this.speed *= Math.random() < chance ? -1 : 1;
        console.log(this.speed);
    }

    updatePos(delta = 0) {
        this.position.y += this.speed;
        this.rotation.y = delta;

        if (Math.abs(this.position.y - this.orgPosY) > this.allowed_deviation) {
            this.position.y -= this.speed;
        }

        this._setDirection();
    }
}

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
    const intensity = 0.6;
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(-1, 4, 6);
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
    const sphere_geometry = new THREE.SphereGeometry(4, 64, 64);
    const sphere_material = new THREE.MeshPhongMaterial({ emissive: 0xFF9B2A });
    const sphere = new THREE.Mesh(sphere_geometry, sphere_material);
    scene.add(sphere);

    // Fetch images for cards and generate them
    const cards = generateCards([0, 1, 2, 3, 4, 5, 6, 7, 8], 6, sphere);

    /**
     * Creates a card for-each image url in imgArr and 
     * uniformly distributes them around the parent at a set radius.
     * 
     * @param {Object[]}  imgArr - Array of image urls.
     * @param {Number} radius - Orbit radius, from parent center to card center.
     * @param {*} parent - Parent element, must have add() function.
     * @returns array of generated cards
     */
    function generateCards(imgArr, radius, parent) {
        const angleOffset = 2*Math.PI / imgArr.length;
        const cards = [];
        for (let i = 0; i < imgArr.length; i++) {
            const geometry = getRoundedEdgePlaneGeometry(2, 3 , 0.6);
            const material = new THREE.MeshPhongMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide });
            const card = new CardMesh(geometry, material, 0.01, 4);

            // Position all cards around the parent uniformly
            card.position.z = radius * Math.cos(i * angleOffset);
            card.position.x = radius * Math.sin(i * angleOffset);

            cards.push(card);
            parent.add(card);
        };

        return cards;
    }

    /**
     * Creates a flat 2D plane with rounded edges.
     * 
     * @author Liron Toledo, with minor changes by Jesper J. Oskarsson
     * @see https://stackoverflow.com/questions/65567873/create-a-plane-with-curved-edges-using-planegeometry-three-js
     */
    function getRoundedEdgePlaneGeometry(width, height, radius) {
        const x = -width/2;
        const y = -height/2;

        const shape = new THREE.Shape();
        shape.moveTo(x, y + radius);
        shape.lineTo(x, y + height - radius);
        shape.quadraticCurveTo(x, y + height, x + radius, y + height);
        shape.lineTo(x + width - radius, y + height);
        shape.quadraticCurveTo(x + width, y + height, x + width, y + height - radius);
        shape.lineTo(x + width, y + radius);
        shape.quadraticCurveTo(x + width, y, x + width - radius, y);
        shape.lineTo(x + radius, y);
        shape.quadraticCurveTo(x, y, x, y + radius);

        return new THREE.ShapeGeometry(shape);
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
    function render(time) {
        time *= 0.0001;

        // Camera only needs to be updated if canvas size is changed
        if (resizeRendererToDisplaySize(renderer)) {   
            const canvas = renderer.domElement;
            camera.aspect = canvas.clientWidth / canvas.clientHeight;
            camera.updateProjectionMatrix();
        }

        sphere.rotation.y = time;
        cards.forEach(card => {
            card.updatePos(-time);
        });
        
        controls.update();
        
        renderer.render(scene, camera);

        requestAnimationFrame(render)
    }

    requestAnimationFrame(render)
}

main();