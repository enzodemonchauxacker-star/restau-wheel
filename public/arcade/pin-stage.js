import * as THREE from "three";
import { GLTFLoader } from "/arcade/vendor/GLTFLoader.js";
import { RoomEnvironment } from "/arcade/vendor/RoomEnvironment.js";

const loader = new GLTFLoader();
const source = loader.loadAsync("/arcade/strike-pin.glb");

function gloss(sourceMat, env, ghost) {
  const map = sourceMat.map || null;
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshPhysicalMaterial({
    map,
    color: 0xffffff,
    roughness: ghost ? 0.72 : 0.36,
    metalness: 0,
    clearcoat: ghost ? 0 : 0.8,
    clearcoatRoughness: 0.12,
    envMap: env,
    envMapIntensity: ghost ? 0.22 : 1.15,
    transparent: !!ghost,
    opacity: ghost ? 0.4 : 1,
    depthWrite: !ghost
  });
}

function paint(root, env, ghost) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const prev = obj.material;
    obj.material = gloss(prev, env, ghost);
    obj.castShadow = !ghost;
  });
}

export async function mountPins() {
  const gltf = await source;
  const canvases = document.querySelectorAll("canvas[data-pin]");
  canvases.forEach((canvas) => mount(canvas, gltf));
}

function mount(canvas, gltf) {
  const hero = canvas.dataset.pin === "hero";
  const yaw = Number(canvas.dataset.yaw || 28) * Math.PI / 180;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance"
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;

  const pin = gltf.scene.clone(true);
  pin.scale.setScalar(0.88);
  pin.position.y = 0.44;
  paint(pin, env, false);

  const model = new THREE.Group();
  model.add(pin);
  scene.add(model);

  const ghost = gltf.scene.clone(true);
  ghost.scale.setScalar(0.88);
  ghost.position.y = 0.44;
  paint(ghost, env, true);
  const mirror = new THREE.Group();
  mirror.scale.y = -1;
  mirror.position.y = -0.012;
  mirror.add(ghost);
  scene.add(mirror);

  scene.add(new THREE.AmbientLight(0xffffff, 1.7));
  const key = new THREE.DirectionalLight(0xfff8ee, 4.8);
  key.position.set(2.4, 4.6, 3.4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 2.2);
  fill.position.set(-3.2, 2.4, 2.8);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffe08a, 1.6);
  rim.position.set(-1.2, 3.6, -2.6);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 20);
  camera.position.set(0, 0.3, 3.25);
  camera.lookAt(0, 0.24, 0);

  const pose = () => {
    if (hero && window.__pinPose) {
      model.rotation.set(window.__pinPose.rx, window.__pinPose.ry, window.__pinPose.rz);
      mirror.rotation.y = window.__pinPose.ry;
      mirror.rotation.z = -window.__pinPose.rz;
      mirror.rotation.x = -window.__pinPose.rx;
    } else {
      model.rotation.set(0.05, yaw, Number(canvas.dataset.tilt || 0) * Math.PI / 180);
      mirror.rotation.y = yaw;
    }
  };

  function resize() {
    const w = canvas.clientWidth || 200;
    const h = canvas.clientHeight || 400;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const box = canvas.parentElement;
  const ro = new ResizeObserver(resize);
  ro.observe(box);
  resize();

  renderer.setAnimationLoop(() => {
    pose();
    renderer.render(scene, camera);
  });
}

mountPins().catch((err) => {
  console.error(err);
  document.documentElement.classList.add("pin-fallback");
});
