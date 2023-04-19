import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Class representing a perfect circular orbit around a single central object.
 */
class Orbit {
    /**
     * Create a orbit.
     * 
     * @param {*} center_obj - Object to orbit around.
     * @param {*} radius - Radius from center at which entities will orbit.
     */
    constructor(radius, center_obj) {
        this.radius     = radius;
        this.center_obj = center_obj;
        this.entities   = [];
        this.center     = new THREE.Group();
        this.center.add(center_obj);
    }

    /**
     * @returns THREE.Group representing the orbit system
     */
    getGroup() {
        return this.center;
    }

    /**
     * Adds a new item to the orbit.
     * 
     * @param {*} entity - The entity which will be added to the orbit. 
     * @param {number} angle - The angle in radians where the entity will be placed.
     * @param {boolean} redistribute_all - Set to 'true' to uniformly redistribute all existing items in the orbit.
     */
    add(entity, angle = 0, redistribute_all = false) {
        if (redistribute_all) {
            // Position all existing entities around the parent uniformly with space for the new entity
            const angleOffset = 2*Math.PI / (this.entities.length + 1);

            for (let i = 0; i < this.entities.length; i++) {                
                this.entities[i].position.z = this.radius * Math.cos(angle + (i+1) * angleOffset);
                this.entities[i].position.x = this.radius * Math.sin(angle + (i+1) * angleOffset);
            }
        }
        
        // Set position for new element
        entity.position.z = this.radius * Math.cos(angle);
        entity.position.x = this.radius * Math.sin(angle);

        this.center.add(entity);
        this.entities.push(entity);
    }

    /**
     * Updates positions, rotations and triggers eventual 'update()' functions 
     * of orbit entities.
     * 
     * @param {number} rotation - An angle in radians, set the rotation of the central object and entities.
     * @param {boolean} counter_rotate - If 'true', orbit entities rotation is canceled (not central object though).
     */
    update(rotation, counter_rotate = false) { 
        this.center.rotation.y = rotation;
        this.entities.forEach(entity => {
            try {
                entity.update();
            }
            
            catch (error) {
            }

            if (counter_rotate) {
                entity.rotation.y = -rotation;
            }
        });
    }
}

/**
 * Class extending THREE.Mesh with additional functionality representing floating Cards.
 * 
 * @extends THREE.Mesh
 */
class CardMesh extends THREE.Mesh {
    /**
     * Creates a THREE.Mesh object with vertical travel support.
     * Initial vertical travel direction is randomized (50%) either way.
     * Object will randomly change direction.
     * 
     * @param {*} geometry - A Three.js geometry for the mesh.
     * @param {*} material - A Three.js material for the mesh.
     * @param {number} max_speed - Vertical travel max speed, actual speed is randomized.
     * @param {number} allowed_deviation - Maximum allowed vertical drifting distance, set to 0 for none.
     * @param {number} acceleration - Acceleration on direction change and initial spawning.
     */
    constructor(geometry, material, max_speed, allowed_deviation, acceleration) {
        super(geometry, material);
        this.orgPosY           = this.position.y;
        this.allowed_deviation = allowed_deviation;
        this.max_speed         = max_speed * Math.random();
        this.speed             = 0;
        this.acceleration      = acceleration;
        this._changeDirection(0.5);
    }

    /**
     * Switches vertical direction.
     * 
     * @param {number} chance - Percentage chance of changing direction. 
     */
    _changeDirection(chance = 0.005) {
        const change = Math.random() < chance;
        if (change) {
            this.acceleration *= -1;
        }
    }

    /**
     * Updates vertical position, may trigger a direction switch as well.
     */
    update() {
        // Stop if out-of-bounds       
        if (Math.abs(this.position.y - this.orgPosY) > this.allowed_deviation) {
            this.position.y -= this.speed;
            this.speed = 0;
        }
        
        else {
            this.position.y += this.speed;
        }

        this._changeDirection();

        // Stop if max speed has been reached
        if (Math.abs(this.speed) > this.max_speed) {
            const d = this.speed < 0 ? -1 : 1; // Keep direction of travel
            this.speed = this.max_speed * d;
        } 
        
        else {
            this.speed += this.acceleration;
        }
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
    
    // Orbit and cards setup
    const sphere_geometry = new THREE.SphereGeometry(4, 64, 64);
    const sphere_material = new THREE.MeshPhongMaterial({ emissive: 0xFF9B2A });
    const sphere = new THREE.Mesh(sphere_geometry, sphere_material);

    const orbit = new Orbit(6, sphere);

    const cards = generateCards([0, 1, 2, 3, 4, 5, 6], 6, sphere);
    cards.forEach(card => {
        orbit.add(card, 0, true);
    });

    scene.add(orbit.getGroup());

    /**
     * Creates a card for-each image url in imgArr and 
     * uniformly distributes them around the parent at a set radius.
     * 
     * @param {Object[]} imgArr - Array of image urls.
     * @param {Number} radius - Orbit radius, from parent center to card center.
     * @param {*} parent - Parent element, must have add() function.
     * @returns array of generated cards
     */
    function generateCards(imgArr) {
        const cards = [];
        for (let i = 0; i < imgArr.length; i++) {
            const geometry = getRoundedEdgePlaneGeometry(2, 3 , 0.6);
            const material = new THREE.MeshPhongMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide });
            cards.push(new CardMesh(geometry, material, 0.05, 3.5, 0.0001));
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
        time *= 0.001; // Time since render start in seconds, cumulative

        // Camera only needs to be updated if canvas size is changed
        if (resizeRendererToDisplaySize(renderer)) {   
            const canvas = renderer.domElement;
            camera.aspect = canvas.clientWidth / canvas.clientHeight;
            camera.updateProjectionMatrix();
        }

        orbit.update(time*0.1, true);
        controls.update();
        
        renderer.render(scene, camera);

        requestAnimationFrame(render)
    }

    requestAnimationFrame(render)
}

main();