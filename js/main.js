import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {GUI} from 'three/addons/libs/lil-gui.module.min.js';

class ColorGUIHelper {
    constructor(object, prop) {
      this.object = object;
      this.prop = prop;
    }
    get value() {
      return `#${this.object[this.prop].getHexString()}`;
    }
    set value(hexString) {
      this.object[this.prop].set(hexString);
    }
}

class DegRadHelper {
    constructor(obj, prop) {
      this.obj = obj;
      this.prop = prop;
    }
    get value() {
      return THREE.MathUtils.radToDeg(this.obj[this.prop]);
    }
    set value(v) {
      this.obj[this.prop] = THREE.MathUtils.degToRad(v);
    }
}

class MinMaxGUIHelper {
    constructor(obj, minProp, maxProp, minDif) {
      this.obj = obj;
      this.minProp = minProp;
      this.maxProp = maxProp;
      this.minDif = minDif;
    }
    get min() {
      return this.obj[this.minProp];
    }
    set min(v) {
      this.obj[this.minProp] = v;
      this.obj[this.maxProp] = Math.max(this.obj[this.maxProp], v + this.minDif);
    }
    get max() {
      return this.obj[this.maxProp];
    }
    set max(v) {
      this.obj[this.maxProp] = v;
      this.min = this.min;  // this will call the min setter
    }
}

function makeXYZGUI(gui, vector3, name, onChangeFn) {
    const folder = gui.addFolder(name);
    folder.add(vector3, 'x', -30, 30).onChange(onChangeFn);
    folder.add(vector3, 'y', -30, 30).onChange(onChangeFn);
    folder.add(vector3, 'z', -30, 30).onChange(onChangeFn);
    folder.open();
}

/**
 * Class representing a perfectly circular orbit with a single stationary central object.
 */
class Orbit {
    /**
     * Create a orbit.
     * 
     * @param {*} center_obj - Object in center of orbit.
     * @param {*} radius - Radius from system center at which entities will orbit.
     * @param {number} focus_dist_mult - Multiplier for focus point distance
     * @param {number} trans_dist_mult - Multiplier for transport orbit distance
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
        entity.freeze_rotation = false;

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

            if (counter_rotate && !child.freeze_rotation) {
                child.rotation.y = -rotation;
            }

            // When a child is transferring from transport to main orbit
            if (child.freeze_rotation) {
                child.rotation.y = -rotation*4;
                if (this._isDockRotDone(child)) {
                    child.freeze_rotation = false;
                }
            }
        });

        // Check if transport orbit entities are close enough to dock with main orbit
        this.transport_orbit.children.forEach(child => {
            this._tryDock(child);
        });
    }

    /**
     * Cycles the focused entity.
     * 
     * @param {boolean} backwards - Sets cycle direction.
     */
    cycleFocus(backwards = false) {
        const entities = this.main_orbit.children;
        let toFocus;

        // No active focus item
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

    /**
     * Set 'entity' as new focused entity and returns old focused entity to its position.
     * 
     * @param {THREE.Object3D} entity - The new entity to focus, if 'null' nothing will be focused but 
     * the old focused object will be returned to its position.
     */
    setFocus(entity) {
        // If obj already is focused, return it through the transport orbit
        if (this.clone !== null) {
            this._focusToTransport();
        }

        // Send to focus orbit while hiding real obj in main orbit
        if (entity !== null) {
            this._bringToFront(entity);
        }

        // No new focus entity
        else {
            this.focused.clone = null;
        }
    }

    /**
     * Takes an entity from the main orbit and clones it, the clone is then brought to the focus point.
     * 
     * @param {THREE.Object3D} entity - Entity to focus.
     * @param {number} time - Animation time in milliseconds.
     */
    _bringToFront(entity, time = 3000) {
        this.clone = entity.clone();
        entity.parent.add(this.clone); // To get right position & rotation data
        this.focus_orbit.attach(this.clone); // Drops old parent (main orbit)

        // Hide original entity (still in main orbit)
        entity.visible = false;
        this.hidden_ents.push(entity);

        const new_pos = new THREE.Vector3();
        new_pos.copy(this.clone.position).multiplyScalar(this.focus_dst_mult);
        const direction = new_pos.x < 0 ? 1 : -1; // Find the closet travel direction
        const angle = Math.abs(Math.atan2(new_pos.x, new_pos.z)) * direction;

        // Animated transitions
        new TWEEN.Tween(this.clone.position).to(new_pos, time/1.5).start();
        new TWEEN.Tween(this.clone.rotation).to({y: -angle}, time).start();
        new TWEEN.Tween(this.focus_orbit.rotation).to({y: angle}, time).start();
    }
    
    /**
     * Brings the focused entity from the focus point to the transport orbit.
     * 
     * @param {number} time - Animation time in milliseconds. 
     */
    _focusToTransport(time = 2000) {
        const entity = this.clone;
        this.transport_orbit.attach(entity); // Also removes from focus orbit group
        
        // Re-calc distance for new orbit
        const new_pos = new THREE.Vector3();
        new_pos.copy(entity.position).divideScalar(this.focus_dst_mult);
        new_pos.multiplyScalar(this.trans_dst_mult);
        
        // Animate transition and set rotation to be parallel
        new TWEEN.Tween(entity.position).to(new_pos, time).start();
        entity.rotation.y = -this.transport_orbit.rotation.y;

        // Reset focus orbit for next _bringToFront() call so 
        // that it always starts at the same position
        this.focus_orbit.rotation.y = 0;
    }

    /**
     * Tries to dock an entity from transport orbit into a free slot on the main orbit.
     * 
     * @param {THREE.Object3D} obj - Entity to try and dock.
     * @param {number} docking_range - Distance threshold used to determine when to start the docking process.
     * @param {number} time - Animation time in milliseconds.
     */
    _tryDock(obj, docking_range = 6, time = 3000) {
        const actual_pos = new THREE.Vector3();
        obj.getWorldPosition(actual_pos);

        this.hidden_ents.forEach((hidden_obj, i) => {
            // Convert to world positions
            const target_pos = new THREE.Vector3();
            hidden_obj.getWorldPosition(target_pos);
            target_pos.multiplyScalar(this.trans_dst_mult); // Because entity is in main orbit

            // If inside docking range
            if (actual_pos.distanceToSquared(target_pos) <= docking_range) {
                obj.freeze_rotation = true;
                this.main_orbit.attach(obj);

                const system_rotation = new THREE.Quaternion();
                this.system.getWorldQuaternion(system_rotation);
        
                const obj_rotation = new THREE.Quaternion();
                obj.getWorldQuaternion(obj_rotation);
                const angle = obj_rotation.angleTo(system_rotation);

                obj.rotation.y = angle;

                new TWEEN.Tween(obj.position)
                .to({x: hidden_obj.position.x, z: hidden_obj.position.z}, time)
                .start();

                const ctx = {obj, hidden_obj};
                const onFinish = function() {
                    this.obj.removeFromParent();
                    this.hidden_obj.visible = true;
                }.bind(ctx);

                setTimeout(onFinish, time);

                this.hidden_ents.splice(i, 1);
            }
        });
    }

    /**
     * Checks if entity is sufficiently rotated.
     * 
     * @param {THREE.Object3D} obj - Entity to check.
     * @param {number} tolerance - The angle threshold in radians between the actual and targeted position, function will start returning 'true'
     * after it has been reached. Defaults to 1 degree.
     * 
     * @returns 'true' if angle is within threshold.
     */
    _isDockRotDone(obj, tolerance = 0.0175) {
        const system_rotation = new THREE.Quaternion();
        this.system.getWorldQuaternion(system_rotation);

        const obj_rotation = new THREE.Quaternion();
        obj.getWorldQuaternion(obj_rotation);
        const angle = obj_rotation.angleTo(system_rotation);

        return (angle <= tolerance || angle >= Math.PI - tolerance) ? true : false;
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
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.NoToneMapping;

    // Camera setup
    const fov    = 75;
    const aspect = 2;
    const near   = 0.1;
    const far    = 100;
    const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.position.z = 10;
    camera.up.set(0, 1, 0); // Set camera up direction, needed for lookAt()
    camera.lookAt(0, 0, 0); // Point camera towards origo

    // Controls setup
    const controls = new OrbitControls(camera, renderer.domElement);

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#192633');

    // Light setup
    const color = 0xFFFFFF;
    const intensity = 0.35;
    const light = new THREE.SpotLight(color, intensity);
    light.position.set(0, 2, 12);
    light.target.position.set(0, 0, 0);
    light.angle = 60*Math.PI/180;
    light.castShadow = true;
    light.shadow.bias = -0.0003;
    light.penumbra = 0.00;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 25;
    light.shadow.camera.zoom = 1.7;
    
    const lightHelper = new THREE.SpotLightHelper(light);
    const cameraHelper = new THREE.CameraHelper(light.shadow.camera);
    
    //scene.add(lightHelper)
    //scene.add(cameraHelper);
    scene.add(light);
    scene.add(light.target);

    const skyColor = 0xFFFFFF;
    const groundColor = 0x000000;
    const intensity2 = 0.6;
    const light2 = new THREE.HemisphereLight(skyColor, groundColor, intensity2);
    light2.position.set(0, 14, 12);
    
    const lightHelper2 = new THREE.HemisphereLightHelper(light2);
    
    //scene.add(lightHelper2)
    scene.add(light2);

    // Orientation markers setup - Used for development
    {
        const X_geometry = new THREE.BoxGeometry(100, 0.1, 0.1);
        const Y_geometry = new THREE.BoxGeometry(0.1, 100, 0.1);
        const Z_geometry = new THREE.BoxGeometry(0.1, 0.1, 100);
        const X_material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const Y_material = new THREE.MeshBasicMaterial({ color: 0x08ff00 });
        const Z_material = new THREE.MeshBasicMaterial({ color: 0x0400ff });
        
        // scene.add(new THREE.Mesh(X_geometry, X_material)); // X - red
        // scene.add(new THREE.Mesh(Y_geometry, Y_material)); // Y - green
        // scene.add(new THREE.Mesh(Z_geometry, Z_material)); // Z - blue
    }
    
    // Orbit and cards setup
    const sphere_geometry = new THREE.SphereGeometry(4, 64, 64);
    const sphere_material = new THREE.MeshPhysicalMaterial({
        clearcoat: 1.00,
        clearcoatRoughness: 0.60,
        roughness: 0.75,
        metalness: 0.85,
        emissive: 0xFF9B2A
    });
    const sphere = new THREE.Mesh(sphere_geometry, sphere_material);
    sphere.receiveShadow = true;
    sphere.castShadow = true;

    const orbit = new Orbit(6.5, sphere);

    const card_media_paths = [
        {path: 'media/Group 370.png', width: 1188, height: 1592},
        {path: 'media/Group 371.png', width: 852, height: 1760},
        {path: 'media/Group 439.png', width: 3432, height: 2232},
        {path: 'media/Group 444.png', width: 852, height: 1760}
    ];
    
    const cards = generateCards(card_media_paths);
    cards.forEach(card => {
        card.receiveShadow = true;
        card.castShadow = true;
        orbit.add(card, 0, true);
    });

    scene.add(orbit.getSystem());

    // GUI setup
    function updateLight() {
        light.target.updateMatrixWorld();
        //lightHelper.update();
        //lightHelper2.update();
    }
    updateLight();

    function updateCamera() {
        // update the light target's matrixWorld because it's needed by the helper
        light.target.updateMatrixWorld();
        //lightHelper.update();
        // update the light's shadow camera's projection matrix
        light.shadow.camera.updateProjectionMatrix();
        // and now update the camera helper we're using to show the light's shadow camera
        cameraHelper.update();
    }
    updateCamera();

    const gui = new GUI();
    
    const folder_light = gui.addFolder('Light');
    folder_light.addColor(new ColorGUIHelper(light, 'color'), 'value').name('color');
    folder_light.add(light, 'intensity', 0, 1, 0.05);
    folder_light.add(new DegRadHelper(light, 'angle'), 'value', 0, 90).name('angle').onChange(updateLight);
    folder_light.add(light, 'penumbra', 0, 1, 0.01);
    makeXYZGUI(folder_light, light.position, 'position', updateLight);
    makeXYZGUI(folder_light, light.target.position, 'target', updateLight);
    
    const folder_light2 = gui.addFolder('Light Focus');
    //folder_light2.addColor(new ColorGUIHelper(light2, 'skyColor'), 'value').name('skyColor');
    //folder_light2.addColor(new ColorGUIHelper(light2, 'groundColor'), 'value').name('groundColor');
    folder_light2.add(light2, 'intensity', 0, 1, 0.05);
    makeXYZGUI(folder_light2, light2.position, 'position', updateLight);
    //makeXYZGUI(folder_light2, light2.target.position, 'target', updateLight);

    const folder_shadow = gui.addFolder('Shadow');
    const minMaxGUIHelper = new MinMaxGUIHelper(light.shadow.camera, 'near', 'far', 0.1);
    folder_shadow.add(minMaxGUIHelper, 'min', 0.1, 50, 0.1).name('near').onChange(updateCamera);
    folder_shadow.add(minMaxGUIHelper, 'max', 0.1, 50, 0.1).name('far').onChange(updateCamera);
    folder_shadow.add(light.shadow.camera, 'zoom', 0.01, 3, 0.01).onChange(updateCamera);
    folder_shadow.add(light.shadow.mapSize, 'height', 0, 1024, 1);
    folder_shadow.add(light.shadow.mapSize, 'width', 0, 1024, 1);
    folder_shadow.add(light.shadow, 'bias', -0.001, 0.001, 0.0001);
    
    const folder_sphere = gui.addFolder('Sphere');
    folder_sphere.addColor(new ColorGUIHelper(sphere_material, 'emissive'), 'value').name('emissive');
    folder_sphere.add(sphere_material, 'clearcoat', 0, 1, 0.05);
    folder_sphere.add(sphere_material, 'clearcoatRoughness', 0, 1, 0.05);
    folder_sphere.add(sphere_material, 'roughness', 0, 1, 0.05);
    folder_sphere.add(sphere_material, 'metalness', 0, 1, 0.05);

    // const folder_cards = gui.addFolder('Cards');
    // folder_cards.addColor(new ColorGUIHelper(card_material, 'emissive'), 'value').name('emissive');
    // folder_cards.add(card_material, 'shininess', 0, 300, 5);
    // folder_cards.add(card_material, 'side', { Front: THREE.FrontSide, Double: THREE.DoubleSide });

    //orbit.cycleFocus();
    // setTimeout(() => {
    //     orbit.cycleFocus();
    // }, 5000);
    // setTimeout(() => {
    //     orbit.cycleFocus();
    // }, 10000);
    // setTimeout(() => {
    //     orbit.cycleFocus();
    // }, 15000);
    // setTimeout(() => {
    //     orbit.cycleFocus();
    // }, 20000);
    // setTimeout(() => {
    //     orbit.cycleFocus();
    // }, 25000);
    // setTimeout(() => {
    //     orbit.cycleFocus();
    // }, 30000);
    // setTimeout(() => {
    //     orbit.cycleFocus();
    // }, 35000);
    // setTimeout(() => {
    //     orbit.cycleFocus();
    // }, 40000);
    
    /**
     * Creates a card for each media object. 
     * 
     * @param {Object[]} media_objs - Array of custom media objects, [{path: 'path/to/media', width: X, height: X}, ...].
     * @returns array of generated custom THREE.Object3D objects.
     */
    function generateCards(media_objs) {
        const loader = new THREE.TextureLoader();
        const cards = [];
        media_objs.forEach(media_obj => {
            const material = new THREE.MeshPhongMaterial({
                map: loader.load(media_obj.path),
                side: THREE.DoubleSide
            });

            // Combat blurriness at distance
            const anisotropy = renderer.capabilities.getMaxAnisotropy();
            material.map.anisotropy = anisotropy;
            material.map.magFilter = THREE.LinearFilter;
            material.map.minFilter = THREE.LinearMipmapLinearFilter;

            const aspect = media_obj.width / media_obj.height;
            const height = 3;
            const width = height * aspect;
            const geometry = new THREE.PlaneGeometry(width, height);

            cards.push(new CardMesh(geometry, material, 0.05, 3.5, 0.0001));
        });

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

        return new THREE.ShapeGeometry(shape, 6);
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