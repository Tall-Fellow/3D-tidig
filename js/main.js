import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {GUI} from 'three/addons/libs/lil-gui.module.min.js';

// GUI stuff
function makeXYZGUI(gui, vector3, name, onChangeFn) {
    const folder = gui.addFolder(name);
    folder.add(vector3, 'x', -30, 30).onChange(onChangeFn);
    folder.add(vector3, 'y', -30, 30).onChange(onChangeFn);
    folder.add(vector3, 'z', -30, 30).onChange(onChangeFn);
    folder.open();
}

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
// End GUI stuff

/**
 * Class representing a perfectly circular orbit around a single stationary central object.
 */
class Orbit {
    /**
     * Create a orbit.
     * 
     * @param {THREE.Camera} camera - The camera used to view the orbit, is for checking if entities are within bounds.
     * @param {number} radius - Radius from system center at which entities will orbit.
     * @param {THREE.Object3D} center_obj - Object in center of orbit.
     * @param {number} focus_dist_mult - Multiplier for focus point distance.
     * @param {number} animation_time - Time in milliseconds, used as a base for animation times.
     */
    constructor(camera, radius, center_obj, focus_dist_mult = 1.3, animation_time = 1200) {
        this.camera          = camera;
        this.radius          = radius;
        this.center_obj      = center_obj;
        this.focus_dst_mult  = focus_dist_mult;
        this.focused         = null; // Holds the focused entity
        this.animation_time  = animation_time;
        this.system          = new THREE.Group(); // The system that holds all the orbits and the center object
        this.main_orbit      = new THREE.Group();
        this.focus_orbit     = new THREE.Group();
        this.system.add(center_obj);
        this.system.add(this.main_orbit);
        this.system.add(this.focus_orbit);

        // Tween animation holders
        this.tween_ent_rot = null;
        this.tween_ent_pos = null;

        // Add mask used to darken scene when an entity is in focus
        const material = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0 });
        material.transparent = true;
        this.opacity_mask = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), material);
        this.opacity_mask.position.set(0, 0, radius * (focus_dist_mult - 0.1)); // Place right behind focus point
        this.system.add(this.opacity_mask);

        // Debug stuff
        this.dup_main_orbit = new THREE.Group();
        // this.system.add(this.dup_main_orbit);
        const fgeometry = new THREE.BoxGeometry(0.3, 0.3, 10);
        const fmaterial = new THREE.MeshBasicMaterial({ color: 0x66327f });
        // this.focus_orbit.add(new THREE.Mesh(fgeometry, fmaterial));
        const mgeometry = new THREE.BoxGeometry(0.3, 0.3, 10);
        const mmaterial = new THREE.MeshBasicMaterial({ color: 0x38bebd });
        // this.dup_main_orbit.add(new THREE.Mesh(mgeometry, mmaterial));
    }

    /**
     * @returns THREE.Group representing the orbit system.
     */
    getSystem() {
        return this.system;
    }

    /**
     * Get all main orbit entities id's.
     * 
     * @returns Array of ids for every entity in main orbit (not focused!).
     */
    getIDs() {
        const ids = [];
        this.main_orbit.children.forEach(obj => {
            ids.push(obj.id);
        });

        return ids;
    }

    /**
     * Adds a new item to the orbit.
     * 
     * @param {THREE.Object3D} entity - The entity which will be added to the orbit. 
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

        this.main_orbit.add(entity);
    }

    /**
     * Updates positions and rotations of main orbit and its entities.
     * 
     * @param {number} rotation - An angle in radians, sets the rotation of the main orbit.
     */
    update(rotation) {
        this.main_orbit.rotation.y = rotation;
        // this.dup_main_orbit.rotation.y = rotation;

        this.main_orbit.children.forEach(child => {
            child.rotation.y = -rotation;
        });
    }

    /**
     * Scales down an entity to fit inside the right half of the screen if needed.
     * 
     * @param {THREE.Object3D} entity - Entity to scale.
     */
    _scale(entity) {
        const rescale = (entity) => {
            const new_scale = new THREE.Vector3().copy(entity.scale).multiplyScalar(0.90); // Scale down in 10% increments

            new TWEEN.Tween(entity).to({scale: new_scale}, 75).onComplete((entity => {
                this._scale(entity);
            })).start();
        };
        
        const raycaster = new THREE.Raycaster();
        // Positions to check if clear
        const positions = [
            new THREE.Vector2(0.7, 0.95),  // Height, top limit (top of screen)
            new THREE.Vector2(0.7, -0.95), // Height, bottom limit (bottom of screen)
            new THREE.Vector2(0, 0),       // Width, left limit (center of screen)
            new THREE.Vector2(1, 0)        // Width, right limit (right of screen)
        ];

        for (let i = 0; i < positions.length; i++) {
            raycaster.setFromCamera(positions[i], this.camera);
            if (raycaster.intersectObject(entity, false).length) {
                rescale(entity);
            }
        }
    }

    /**
     * Set an entity as the new focused entity and returns eventual old focused entity to main orbit.
     * 
     * @param {Number} id - The new entity to focus, if 'null' nothing will be focused but 
     * the old focused object will be returned to orbit.
     */
    setFocus(id) {
        try {
            if (id === this.focused.id) {
                // Item already focused, abort
                return;
            }

            else {
                // Another item is already focused, un-focus it and then proceed
                this._focusedToOrbit();
            }
        }
        
        catch (error) {
            // No focused entity found, ok to proceed
        }

        // Find entity and bring to focus point if found
        const entity = this.main_orbit.children.find(obj => obj.id === id);
        if (entity !== undefined) {
            this._bringToFront(entity);
        }
    }

    /**
     * Adds highlight border effect to an entity and a read more button.
     * 
     * @param {THREE.Object3D} entity - Entity to highlight.
     * 
     * @author Lee Stemkoski
     * @see https://github.com/stemkoski/stemkoski.github.com/blob/master/Three.js/Outline.html
     */
    addHighlight(entity) {
        // Setup read more button
        const loader = new THREE.TextureLoader();
        const btn_material = new THREE.MeshBasicMaterial({
            map: loader.load('media/read_more5.png'),
            side: THREE.FrontSide,
            transparent: true,
        });

        // Combat blurriness at distance
        btn_material.map.magFilter = THREE.LinearFilter;
        btn_material.map.minFilter = THREE.LinearMipmapLinearFilter;

        // Button dimensions
        const btn_width = 0.90;
        const btn_geometry = new THREE.PlaneGeometry(btn_width, btn_width * 1.0); // Aspect ratio hard-coded (texture height/width)
        const btn_mesh = new THREE.Mesh(btn_geometry, btn_material);
        entity.add(btn_mesh);
        
        // Button position
        const btn_x_offset = -1.1 * (entity.geometry.parameters.width/2 + btn_width/2);
        const btn_y_offset = -(entity.geometry.parameters.height/2 - btn_geometry.parameters.height - 0.1);
        btn_mesh.position.set(btn_x_offset, btn_y_offset, 0.1);

        // Setup highlight border
        const highlight_material = new THREE.MeshBasicMaterial({
            color: 0xFF9B2A,
            side: THREE.FrontSide
        });
        const highlight_mesh = new THREE.Mesh(entity.geometry, highlight_material);
        entity.add(highlight_mesh);
        
        highlight_mesh.translateZ(-0.001);

        const max_scale = highlight_mesh.scale.clone().multiplyScalar(1.015); // Upper bound of highlight effect
        new TWEEN.Tween(highlight_mesh.scale)
        .to(max_scale, 2000)
        .repeat(Infinity)
        .yoyo(true)
        .start();
    }

    /**
     * Takes an entity from the main orbit and brings it to the focus point.
     * 
     * @param {THREE.Object3D} entity - Entity to focus.
     */
    _bringToFront(entity) {
        this.focused = entity;

        // Change orbit
        this.focus_orbit.attach(entity); // Drops old parent (main orbit)

        // Cancel vertical movement of entity
        entity.tween_init.stop();
        entity.tween.stop();

        // Calc new position in focus orbit
        const new_pos = new THREE.Vector3();
        new_pos.copy(this.focused.position).multiplyScalar(this.focus_dst_mult);
        new_pos.setY(0);
        
        // Find the shortest travel direction and by how much to rotate
        // focus orbit from angle 0 to the focus point
        const direction = new_pos.x < 0 ? 1 : -1;
        const angle = Math.abs(Math.atan2(new_pos.x, new_pos.z)) * direction;

        // Used to mask scene behind focused entity
        const fade_tween = new TWEEN.Tween(this.opacity_mask.material)
        .easing(TWEEN.Easing.Quadratic.In)
        .to({opacity: 0.6}, 300);
        
        // Reposition entity to focus point (+ offset to set it to the side)
        new TWEEN.Tween(this.focus_orbit.rotation)
            .to({y: angle + Math.PI/14}, this.animation_time)
            .easing(TWEEN.Easing.Circular.Out)
            .start();

        // Counter-rotate entity (with some offset to over-rotate it a bit)
        this.tween_ent_rot = new TWEEN.Tween(entity.rotation)
            .to({y: -angle - Math.PI/12}, this.animation_time)
            .easing(TWEEN.Easing.Circular.Out)
            .chain(fade_tween).start();

        // Bring forward
        this.tween_ent_pos = new TWEEN.Tween(entity)
        .to({position: new_pos}, this.animation_time)
        .onComplete(entity => {
            // After all animations, re-scale entity to fit space and add highlight
            this.addHighlight(entity);
            this._scale(entity);
        }).start();
    }
    
    /**
     * Brings the focused entity from the focus point to the main orbit.
     */
    _focusedToOrbit() {
        const entity = this.focused;
        entity.clear(); // Remove children (highlight & read more btn)

        // Remove entity from focus orbit and temporarily change orbit to 
        // non-rotating system orbit for the transition
        this.system.attach(entity);
        this.focused = null;
        
        // Reset focus orbit for next _bringToFront() call so 
        // that it always starts at the same position
        this.focus_orbit.rotation.y = 0;
        
        // Hide bg fade mask
        new TWEEN.Tween(this.opacity_mask.material)
            .easing(TWEEN.Easing.Quadratic.In)
            .to({opacity: 0}, 300).start();

        // Get position for main orbit docking
        const new_pos = new THREE.Vector3();
        if (this.tween_ent_pos._isPlaying) {
            // If focus change has occured mid animation, stop animation and 
            // enter orbit at current position
            this.tween_ent_rot.stop();
            this.tween_ent_pos.stop();
            new_pos.copy(entity.position).divideScalar(this.focus_dst_mult);
            new_pos.setY(0);
        }
        
        else {
            // Else enter orbit at fixed point 
            const x = this.radius * Math.cos(Math.PI/4);
            const z = this.radius * Math.sin(Math.PI/4);
            new_pos.set(x, 0, z);
        }
        
        // Move to new position and dock when in position
        new TWEEN.Tween({pos: entity.position, entity: entity})
            .to({pos: new_pos}, this.animation_time)
            .easing(TWEEN.Easing.Cubic.Out)
            .onComplete(obj => {
                // Return to main orbit and use the same initial rotation
                this.main_orbit.attach(obj.entity);
                obj.entity.rotation.copy(this.main_orbit.rotation);
                obj.entity.tween_init.start();
            }).start();
    }
}

/**
 * Class extending THREE.Mesh with additional functionality representing floating Cards.
 * 
 * @extends THREE.Mesh
 */
class CardMesh extends THREE.Mesh {
    /**
     * Creates a THREE.Mesh plane object with vertical travel.
     * Initial vertical travel direction is randomized (50%) either way.
     * Mesh will change direction after reaching end.
     * 
     * @param {*} geometry - A Three.js geometry for the mesh.
     * @param {*} material - A Three.js material for the mesh.
     * @param {number} allowed_deviation - Maximum allowed vertical drifting distance, set to 0 for none.
     */
    constructor(geometry, material, allowed_deviation) {
        super(geometry, material);
        this.allowed_deviation = allowed_deviation;
        const max_time = 10000; // Upper-bound of animation time
        const min_time = 5000; // Lower-bound of animation time
        const time = Math.random() * (max_time - min_time) + min_time; // Pick a time in-between upper and lower time bound
        const direction = Math.random() < 0.5? 1 : -1;
        this.bound = this.position.y + (Math.abs(allowed_deviation) * direction);
        this.tween = new TWEEN.Tween(this.position)
            .to({y: -this.bound}, time)
            .easing(TWEEN.Easing.Back.InOut)
            .repeat(Infinity)
            .yoyo(true)
            .onRepeat(() => {
                this.bound *= -1;
            });
        this.tween_init = new TWEEN.Tween(this.position)
            .to({y: this.bound}, time/2)
            .easing(TWEEN.Easing.Back.Out)
            .chain(this.tween)
            .start();
    }
}

/**
 * Class used to click inside THREE.js.
 */
class PickHelper {
    constructor() {
      this.raycaster = new THREE.Raycaster();
    }

    /**
     * 
     * @param {THREE.Vector2} normalized_position - 2D coordinates of the mouse, in normalized device coordinates (NDC), X and Y between -1 and 1.
     * @param {THREE.Object3D} scene - The THREE.Scene/Object3D containing the relevant entities.
     * @param {THREE.Camera} camera - Camera to raycast through.
     * @returns The first/closest object intersected.
     */
    pick(normalized_position, scene, camera) {   
      // Cast a ray through the frustum
      this.raycaster.setFromCamera(normalized_position, camera);
      // Get the list of objects the ray intersected
      const intersectedObjects = this.raycaster.intersectObjects(scene.children);
      if (intersectedObjects.length) {
        // Pick the first object. It's the closest one
        return intersectedObjects[0].object;
      }
    }
}

function main() {
    const canvas = document.querySelector('#main_canvas');
    const info_block = document.querySelector('.info_block_wrapper');
    const nav_menu = document.querySelector('#menu');
    const exit_cross = document.querySelector('#exit_cross');

    // Transistion setups
        // Exit splash screen
    document.querySelector('#threejs_sec').addEventListener('click', enterExplorationMode, { once: true });
        // Exit detail mode
    document.querySelector('.info_block_return').addEventListener('click', exitDetailMode);
        // Exit focus mode
    exit_cross.addEventListener('click', exitFocusMode);
    
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
    const camera_target = {x: -10, y: 0, z: -10};
    camera.position.set(-5, 0, 15);
    camera.up.set(0, 1, 0); // Set camera up direction, needed for lookAt()
    camera.lookAt(camera_target.x, camera_target.y, camera_target.z); // Point camera towards target

    // Controls setup
    //const controls = new OrbitControls(camera, renderer.domElement);

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

    const orbit = new Orbit(camera, 6.5, sphere);

    const cards_data = [
        {
            path: 'media/Group 121.png', 
            width: 558, height: 600,
            title: 'Title 0',
            content: `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor 
                incididunt ut labore et dolore magna aliqua. In arcu cursus euismod quis viverra nibh cras. 
                Bibendum est ultricies integer quis auctor elit sed. Est lorem ipsum dolor sit amet. 
                Netus et malesuada fames ac turpis egestas maecenas. Dolor purus non enim praesent elementum 
                facilisis leo. Quis ipsum suspendisse ultrices gravida. Tristique et egestas quis ipsum 
                suspendisse ultrices gravida. Aenean euismod elementum nisi quis eleifend quam adipiscing. 
                Sit amet volutpat consequat mauris nunc congue nisi.`
        },
        {
            path: 'media/Group 370.png', 
            width: 441, height: 600,
            title: 'Title 1',
            content: `<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor 
                incididunt ut labore et dolore magna aliqua. In arcu cursus euismod quis viverra nibh cras. 
                Bibendum est ultricies integer quis auctor elit sed. Est lorem ipsum dolor sit amet. 
                Netus et malesuada fames ac turpis egestas maecenas. Dolor purus non enim praesent elementum 
                facilisis leo. Quis ipsum suspendisse ultrices gravida. Tristique et egestas quis ipsum 
                suspendisse ultrices gravida. Aenean euismod elementum nisi quis eleifend quam adipiscing. 
                Sit amet volutpat consequat mauris nunc congue nisi.</p>
                
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor 
                incididunt ut labore et dolore magna aliqua. In arcu cursus euismod quis viverra nibh cras. 
                Bibendum est ultricies integer quis auctor elit sed. Est lorem ipsum dolor sit amet. 
                Netus et malesuada fames ac turpis egestas maecenas. Dolor purus non enim praesent elementum 
                facilisis leo. Quis ipsum suspendisse ultrices gravida. Tristique et egestas quis ipsum 
                suspendisse ultrices gravida. Aenean euismod elementum nisi quis eleifend quam adipiscing. 
                Sit amet volutpat consequat mauris nunc congue nisi.</p>`
        },
        {
            path: 'media/Group 371.png',
            width: 277, height: 600,
            title: 'Title 2',
            content: `<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor 
                incididunt ut labore et dolore magna aliqua. In arcu cursus euismod quis viverra nibh cras. 
                Bibendum est ultricies integer quis auctor elit sed. Est lorem ipsum dolor sit amet. 
                Netus et malesuada fames ac turpis egestas maecenas. Dolor purus non enim praesent elementum 
                facilisis leo. Quis ipsum suspendisse ultrices gravida. Tristique et egestas quis ipsum 
                suspendisse ultrices gravida. Aenean euismod elementum nisi quis eleifend quam adipiscing. 
                Sit amet volutpat consequat mauris nunc congue nisi.</p>
                
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor 
                incididunt ut labore et dolore magna aliqua. In arcu cursus euismod quis viverra nibh cras. 
                Bibendum est ultricies integer quis auctor elit sed. Est lorem ipsum dolor sit amet. 
                Netus et malesuada fames ac turpis egestas maecenas. Dolor purus non enim praesent elementum 
                facilisis leo. Quis ipsum suspendisse ultrices gravida. Tristique et egestas quis ipsum 
                suspendisse ultrices gravida. Aenean euismod elementum nisi quis eleifend quam adipiscing. 
                Sit amet volutpat consequat mauris nunc congue nisi.</p>`
        },
        {
            path: 'media/Group 373.png',
            width: 277, height: 600,
            title: 'Title 3',
            content: `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor 
                incididunt ut labore et dolore magna aliqua. In arcu cursus euismod quis viverra nibh cras. 
                Bibendum est ultricies integer quis auctor elit sed. Est lorem ipsum dolor sit amet. 
                Netus et malesuada fames ac turpis egestas maecenas. Dolor purus non enim praesent elementum 
                facilisis leo. Quis ipsum suspendisse ultrices gravida. Tristique et egestas quis ipsum 
                suspendisse ultrices gravida. Aenean euismod elementum nisi quis eleifend quam adipiscing. 
                Sit amet volutpat consequat mauris nunc congue nisi.`
        },
        {
            path: 'media/Group 439.png',
            width: 933, height: 600,
            title: 'Title 4',
            content: `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor 
                incididunt ut labore et dolore magna aliqua. In arcu cursus euismod quis viverra nibh cras. 
                Bibendum est ultricies integer quis auctor elit sed. Est lorem ipsum dolor sit amet. 
                Netus et malesuada fames ac turpis egestas maecenas. Dolor purus non enim praesent elementum 
                facilisis leo. Quis ipsum suspendisse ultrices gravida. Tristique et egestas quis ipsum 
                suspendisse ultrices gravida. Aenean euismod elementum nisi quis eleifend quam adipiscing. 
                Sit amet volutpat consequat mauris nunc congue nisi.`
        },
        {
            path: 'media/Group 440.png',
            width: 277, height: 600,
            title: 'Title 5',
            content: `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor 
                incididunt ut labore et dolore magna aliqua. In arcu cursus euismod quis viverra nibh cras. 
                Bibendum est ultricies integer quis auctor elit sed. Est lorem ipsum dolor sit amet. 
                Netus et malesuada fames ac turpis egestas maecenas. Dolor purus non enim praesent elementum 
                facilisis leo. Quis ipsum suspendisse ultrices gravida. Tristique et egestas quis ipsum 
                suspendisse ultrices gravida. Aenean euismod elementum nisi quis eleifend quam adipiscing. 
                Sit amet volutpat consequat mauris nunc congue nisi.`
        },
        {
            path: 'media/Group 443.png',
            width: 278, height: 600,
            title: 'Direkt kommunikation',
            content: `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor 
                incididunt ut labore et dolore magna aliqua. In arcu cursus euismod quis viverra nibh cras. 
                Bibendum est ultricies integer quis auctor elit sed. Est lorem ipsum dolor sit amet. 
                Netus et malesuada fames ac turpis egestas maecenas. Dolor purus non enim praesent elementum 
                facilisis leo. Quis ipsum suspendisse ultrices gravida. Tristique et egestas quis ipsum 
                suspendisse ultrices gravida. Aenean euismod elementum nisi quis eleifend quam adipiscing. 
                Sit amet volutpat consequat mauris nunc congue nisi.`
        },
        {
            path: 'media/Group 444.png',
            width: 277, height: 600,
            title: 'Title 7',
            content: `<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor 
                incididunt ut labore et dolore magna aliqua. In arcu cursus euismod quis viverra nibh cras. 
                Bibendum est ultricies integer quis auctor elit sed. Est lorem ipsum dolor sit amet. 
                Netus et malesuada fames ac turpis egestas maecenas. Dolor purus non enim praesent elementum 
                facilisis leo. Quis ipsum suspendisse ultrices gravida. Tristique et egestas quis ipsum 
                suspendisse ultrices gravida. Aenean euismod elementum nisi quis eleifend quam adipiscing. 
                Sit amet volutpat consequat mauris nunc congue nisi.</p>
                
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor 
                incididunt ut labore et dolore magna aliqua. In arcu cursus euismod quis viverra nibh cras. 
                Bibendum est ultricies integer quis auctor elit sed. Est lorem ipsum dolor sit amet. 
                Netus et malesuada fames ac turpis egestas maecenas. Dolor purus non enim praesent elementum 
                facilisis leo. Quis ipsum suspendisse ultrices gravida. Tristique et egestas quis ipsum 
                suspendisse ultrices gravida. Aenean euismod elementum nisi quis eleifend quam adipiscing. 
                Sit amet volutpat consequat mauris nunc congue nisi.</p>`
        }
    ];
    
    const cards = generateCards(cards_data);
    cards.forEach((card, i) => {
        cards_data[i].id = card.id; // Append generated card id to card data

        card.receiveShadow = true;
        card.castShadow = true;
        orbit.add(card, 0, true);
    });

    scene.add(orbit.getSystem());

    // GUI setup
    updateLight();
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
    
    // Click object picker setup
    const pick_helper = new PickHelper();
    const pick_pos = {x: 0, y: 0};

    const f_bound = handleClick.bind(orbit);
    window.addEventListener('click', f_bound);

    // Vertical nav menu setup using Swiper.js
    const swiper = setupMenu();

    requestAnimationFrame(render)

    

    //--- FUNCTIONS ---//



    function setupMenu() {
        // Build HTML
        const parent = document.querySelector('.swiper-wrapper');
        const card_ids = orbit.getIDs();
        card_ids.forEach(id => {
            const title = cards_data.find(obj => obj.id === id).title;
            const html = `<div class="swiper-slide" data-id="${id}"><button type="button">${title}</button></div>`
            parent.insertAdjacentHTML('beforeend', html);
        });

        // Setup Swiper.js
        const swiper = new Swiper('.swiper', {
            enabled: false,
            direction: 'vertical',
            loop: true,
            slidesPerView: Math.floor(card_ids.length/2), // Must be >= Menu items/2
            grabCursor: true,
            slideToClickedSlide: true,
            mousewheel: {},
            scrollbar: {
                el: '.swiper-scrollbar',
                draggable: true,
                snapOnRelease: true,
            },
            keyboard: {
                enabled: true,
                pageUpDown: false,
            }
        });
    
        // Update focused Three.js item to match active slide
        swiper.on('slideChangeTransitionEnd', (event) => {
            const active_slide = event.slides[event.activeIndex];
            orbit.setFocus(Math.floor(Number(active_slide.dataset.id)));

            if (exit_cross.style.visibility === 'hidden') {
                exit_cross.style.visibility = 'visible';
            }
        });

        return swiper;
    }

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

            cards.push(new CardMesh(geometry, material, 1.3));
        });

        return cards;
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

    // Used for Three.js clicking
    function getCanvasRelativePosition(event) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * canvas.width  / rect.width,
            y: (event.clientY - rect.top ) * canvas.height / rect.height,
        };
    }
    
    // Used for Three.js clicking
    function handleClick(event) {
        if (this.focused === null) { return; }

        const pos = getCanvasRelativePosition(event);
        pick_pos.x = (pos.x / canvas.width ) *  2 - 1;
        pick_pos.y = (pos.y / canvas.height) * -2 + 1;  // note we flip Y

        const picked = pick_helper.pick(pick_pos, scene, camera);
        if (picked.id === this.focused.id || picked.parent.id === this.focused.id) {
            enterDetailMode();
        }
    }

    // Used for lil.gui
    function updateCamera() {
        // update the light target's matrixWorld because it's needed by the helper
        light.target.updateMatrixWorld();
        //lightHelper.update();
        // update the light's shadow camera's projection matrix
        light.shadow.camera.updateProjectionMatrix();
        // and now update the camera helper we're using to show the light's shadow camera
        cameraHelper.update();
    }

    // Used for lil.gui
    function updateLight() {
        light.target.updateMatrixWorld();
        //lightHelper.update();
        //lightHelper2.update();
    }

    // Used to remove splash screen and reposition camera
    function enterExplorationMode() {
        document.querySelector('#threejs_sec').style.cursor = 'auto';
        const splash = document.querySelector('#splash');
        // Set element visibilities
        splash.style.opacity = 0;
        nav_menu.style.opacity = 1;
        swiper.enable();

        // Pan camera to right position
        const time = 2000;
        const new_pos = {x: 0, y: 0, z: 10.5}; // Final position of camera
        // Smooth target transition
        new TWEEN.Tween(camera_target).to({x: 0, y: 0, z: 0}, (time-30))
            .easing(TWEEN.Easing.Cubic.Out)
            .start();
        // Smooth camera movement
        new TWEEN.Tween(camera).to({position: new_pos}, time)
            .easing(TWEEN.Easing.Quadratic.InOut)
            .onUpdate((camera) => {
                camera.lookAt(camera_target.x, camera_target.y, camera_target.z);
            })
            .onComplete((camera) => {
                camera.lookAt(camera_target.x, camera_target.y, camera_target.z);
            }).start();
    }

    // Used for menu transitions
    function enterDetailMode() {
        // Load data of current focused orbit object into info block
        const data = cards_data.find(obj => obj.id === orbit.focused.id);
        const title = document.querySelector('.info_block h1');
        const body = document.querySelector('.info_block_content');

        title.innerHTML = data.title;
        body.innerHTML = data.content;

        // Set visibilities
        info_block.style.opacity = 1;
        nav_menu.style.opacity = 0;
        orbit.focused.clear();
        swiper.disable();
    }
    
    // Used for menu transitions
    function exitDetailMode() {
        info_block.style.opacity = 0;
        nav_menu.style.opacity = 1;
        orbit.addHighlight(orbit.focused); // Re-add highlight
        swiper.enable();
    }

    function exitFocusMode() {
        orbit.setFocus(null);
        exit_cross.style.visibility = 'hidden';
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
        //controls.update();
        
        renderer.render(scene, camera);
    }
}

main();