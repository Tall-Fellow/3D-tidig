import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Class representing a perfect circular orbit with a single stationary central object.
 */
class Orbit {
    /**
     * Create a orbit.
     * 
     * @param {*} center_obj - Object in center of orbit.
     * @param {*} radius - Radius from system center at which entities will orbit.
     */
    constructor(radius, center_obj, focus_dist_mult = 1.3, trans_dist_mult = 1.2) {
        this.radius          = radius;
        this.center_obj      = center_obj;
        this.focus_dst_mult  = focus_dist_mult;
        this.trans_dst_mult  = trans_dist_mult;
        this.clone           = null;
        this.hidden_ents     = [];
        this.system          = new THREE.Group();
        this.main_orbit      = new THREE.Group();
        this.focus_orbit     = new THREE.Group();
        this.transport_orbit = new THREE.Group();
        this.system.add(center_obj);
        this.system.add(this.main_orbit);
        this.system.add(this.focus_orbit);
        this.system.add(this.transport_orbit);
    }

    /**
     * @returns THREE.Group representing the orbit system
     */
    getSystem() {
        return this.system;
    }

    /**
     * Adds a new item to the orbit.
     * 
     * @param {*} entity - The entity which will be added to the orbit. 
     * @param {number} angle - The angle in radians where the entity will be placed.
     * @param {boolean} redistribute_all - Set to 'true' to uniformly redistribute all existing items in the orbit.
     */
    add(entity, angle = 0, redistribute_all = false) {
        const entities = this.main_orbit.children;
        if (redistribute_all) {
            // Position all existing entities around the parent uniformly with space for the new entity
            const angleOffset = 2*Math.PI / (entities.length + 1);

            for (let i = 0; i < entities.length; i++) {                
                entities[i].position.z = this.radius * Math.cos(angle + (i+1) * angleOffset);
                entities[i].position.x = this.radius * Math.sin(angle + (i+1) * angleOffset);
            }
        }
        
        // Set position for new element and add a new property
        entity.position.z = this.radius * Math.cos(angle);
        entity.position.x = this.radius * Math.sin(angle);
        entity.disable_rotation = false;

        this.main_orbit.add(entity);
    }

    /**
     * Updates positions, rotations and triggers eventual 'update()' functions 
     * of orbit entities.
     * 
     * @param {number} rotation - An angle in radians, set the rotation of the orbit entities.
     * @param {boolean} counter_rotate - If 'true', orbit entities rotation is canceled.
     */
    update(rotation, counter_rotate = false) {
        this.main_orbit.rotation.y = rotation;
        this.transport_orbit.rotation.y = rotation*3;

        this.main_orbit.children.forEach(child => {
            try {
                // child.update();
            }
            
            catch (error) {
            }
            
            if (counter_rotate && !child.disable_rotation) {
                child.rotation.y = -rotation;
            }
        });

        this.transport_orbit.children.forEach(child => {
            this._tryDock(child);
        });
    }

    cycleFocus(backwards = false) {
        let toFocus;
        const entities = this.main_orbit.children;
        if (this.clone === null && entities.length > 0) {
            toFocus = backwards ? entities[entities.length-1] : entities[0];
        }
        
        else {
            let f_index = entities.indexOf(this.hidden_ents[this.hidden_ents.length-1].entity); // Focused is always last in hidden_ents
            f_index = backwards ? f_index-1 : f_index+1;

            if (f_index == entities.length) {
                f_index = 0
            }
            
            else if (f_index < 0) {
                f_index = entities.length-1;
            }

            toFocus = entities[f_index];
        }

        this.setFocus(toFocus);
    }

    setFocus(entity) {
        // If obj already is focused, return it through the transport orbit
        if (this.clone !== null) {
            this._focusToTransport();
        }

        // Clone obj & send clone to focus orbit while hiding real obj in main orbit
        if (entity !== null) {
            this._bringToFront(entity);

            entity.visible = false;
            this.hidden_ents.push({id: this.clone.id, entity: entity});
        }

        else {
            this.focused.clone = null;
        }
    }

    _bringToFront(entity) {
        this.clone = entity.clone();
        entity.parent.add(this.clone);
        this.focus_orbit.attach(this.clone);

        const new_pos = new THREE.Vector3();
        new_pos.copy(this.clone.position).multiplyScalar(this.focus_dst_mult);
        const direction = new_pos.x < 0 ? 1 : -1;
        const angle = Math.abs(Math.atan2(new_pos.x, new_pos.z)) * direction;

        const time = 3000;
        new TWEEN.Tween(this.clone.position).to(new_pos, time/1.5).start();
        new TWEEN.Tween(this.clone.rotation).to({y: -angle}, time).start();
        new TWEEN.Tween(this.focus_orbit.rotation).to({y: angle}, time).start();
    }
    
    _focusToTransport() {
        const entity = this.clone;
        this.transport_orbit.attach(entity); // Also removes from focus orbit group
        
        const new_pos = new THREE.Vector3();
        new_pos.copy(entity.position).divideScalar(this.focus_dst_mult);
        new_pos.multiplyScalar(this.trans_dst_mult);
        
        const time = 1000;
        new TWEEN.Tween(entity.position).to(new_pos, time).start();
        entity.rotation.y = -this.transport_orbit.rotation.y;

        // Reset focus orbit for next _bringToFront() call
        this.focus_orbit.rotation.y = 0;
    }

    _tryDock(entity) {
        const docking_range = 6;
        const time = 2000;

        const actual_pos = new THREE.Vector3();
        entity.getWorldPosition(actual_pos);

        this.hidden_ents.forEach((obj, i) => {
            // Convert to world positions
            const target_pos = new THREE.Vector3();
            obj.entity.getWorldPosition(target_pos);
            target_pos.multiplyScalar(this.trans_dst_mult); // Because obj.entity is in main orbit

            // If inside docking range
            if (actual_pos.distanceToSquared(target_pos) <= docking_range) {
                entity.disable_rotation = true;
                this.main_orbit.attach(entity);

                new TWEEN.Tween(entity.rotation)
                .to({y: obj.entity.rotation.y}, time)
                .start();

                new TWEEN.Tween(entity.position)
                .to({x: obj.entity.position.x, z: obj.entity.position.z}, time)
                .start();

                const ctx = {entity, obj};
                const onFinish = function() {
                    this.entity.removeFromParent();
                    this.obj.entity.visible = true;
                }.bind(ctx);

                setTimeout(onFinish, time*1);

                this.hidden_ents.splice(i, 1);
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
    camera.position.z = 0;
    camera.position.y = 15;
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
    const sphere_geometry = new THREE.SphereGeometry(4, 32, 32);
    const sphere_material = new THREE.MeshPhongMaterial({ emissive: 0xFF9B2A });
    const sphere = new THREE.Mesh(sphere_geometry, sphere_material);

    const orbit = new Orbit(6, sphere);

    const cards = generateCards([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 6, sphere);
    cards.forEach(card => {
        orbit.add(card, 0, true);
    });

    scene.add(orbit.getSystem());

    orbit.cycleFocus();
    setTimeout(() => {
        orbit.cycleFocus();
    }, 5000);
    setTimeout(() => {
        orbit.cycleFocus();
    }, 10000);
    setTimeout(() => {
        orbit.cycleFocus();
    }, 15000);
    setTimeout(() => {
        orbit.cycleFocus();
    }, 20000);
    
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
        requestAnimationFrame(render);
        TWEEN.update();
        
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
    }

    requestAnimationFrame(render)
}

main();