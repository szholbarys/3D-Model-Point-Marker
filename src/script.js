import * as THREE from "three/build/three.module.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";

const container = document.getElementById("container");
const loadModelBtn = document.getElementById("load-model-btn");
const fileInput = document.getElementById("file-input");
const clearPointsBtn = document.getElementById("clear-points-btn");
const exportPointsBtn = document.getElementById("export-points-btn");
const pointsList = document.getElementById("points-list");

let renderer, scene, camera;
let currentModel;
let raycaster;
const mouse = new THREE.Vector2();
let intersects = [];
let controls;

let markerPoints = [];
let selectedPoint = null;
let activeInfoLabel = null;

const markerParams = {
  size: 0.1,
  color: 0xff0000,
  shape: "sphere",
  showLabels: true,
};

let labelRenderer;

init();

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  container.appendChild(labelRenderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 5, 10);

  scene.add(new THREE.AmbientLight(0x666666));

  const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
  directionalLight.position.set(1, 1, 1);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 2;
  controls.maxDistance = 50;
  controls.update();

  raycaster = new THREE.Raycaster();

  const groundGeometry = new THREE.PlaneGeometry(20, 20);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x333333,
    transparent: true,
    opacity: 0.5,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const gridHelper = new THREE.GridHelper(20, 20);
  scene.add(gridHelper);

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("click", onMouseClick);
  loadModelBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", loadModel);
  clearPointsBtn.addEventListener("click", clearPoints);
  exportPointsBtn.addEventListener("click", exportPoints);

  const gui = new GUI();
  const markerFolder = gui.addFolder("Marker Settings");
  markerFolder
    .add(markerParams, "size", 0.1, 2)
    .name("Size")
    .onChange(updateMarkers);
  markerFolder
    .addColor(markerParams, "color")
    .name("Color")
    .onChange(updateMarkers);
  markerFolder
    .add(markerParams, "shape", ["sphere", "cube", "cone"])
    .name("Shape")
    .onChange(updateMarkers);
  markerFolder
    .add(markerParams, "showLabels")
    .name("Show Labels")
    .onChange(updateMarkers);
  markerFolder.open();

  animate();

  loadDefaultModel();
}

function loadDefaultModel() {
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
  );
  loader.setDRACOLoader(dracoLoader);

  const textureLoader = new THREE.TextureLoader();
  const map = textureLoader.load(
    "https://threejs.org/examples/models/gltf/LeePerrySmith/Map-COL.jpg"
  );
  map.colorSpace = THREE.SRGBColorSpace;
  const specularMap = textureLoader.load(
    "https://threejs.org/examples/models/gltf/LeePerrySmith/Map-SPEC.jpg"
  );
  const normalMap = textureLoader.load(
    "https://threejs.org/examples/models/gltf/LeePerrySmith/Infinite-Level_02_Tangent_SmoothUV.jpg"
  );

  loader.load(
    "https://threejs.org/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb",
    (gltf) => {
      const mesh = gltf.scene.children[0];
      mesh.material = new THREE.MeshPhongMaterial({
        specular: 0x111111,
        map: map,
        specularMap: specularMap,
        normalMap: normalMap,
        shininess: 25,
      });

      mesh.scale.multiplyScalar(10);
      addModelToScene({ scene: mesh });
    },
    (xhr) => {
      console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
    },
    (error) => {
      console.error("An error happened", error);
      loader.load(
        "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/RiggedFigure/glTF/RiggedFigure.gltf",
        (gltf) => {
          addModelToScene(gltf);
        },
        undefined,
        (error) => {
          console.error("Fallback model also failed", error);
        }
      );
    }
  );
}

function loadModel(event) {
  const file = event.target.files[0];
  if (!file) return;

  const loader = new GLTFLoader();

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
  );
  loader.setDRACOLoader(dracoLoader);

  const reader = new FileReader();
  reader.onload = (e) => {
    const contents = e.target.result;

    loader.parse(
      contents,
      "",
      (gltf) => {
        addModelToScene(gltf);
      },
      (error) => {
        console.error("An error happened", error);
      }
    );
  };

  reader.readAsArrayBuffer(file);
}

function addModelToScene(gltf) {
  if (currentModel) {
    scene.remove(currentModel);
  }

  clearPoints();
  removeInfoLabel();

  currentModel = gltf.scene;

  const box = new THREE.Box3().setFromObject(currentModel);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 5 / maxDim;

  currentModel.position.x = -center.x * scale;
  currentModel.position.z = -center.z * scale;

  currentModel.position.y = -box.min.y * scale;

  currentModel.scale.multiplyScalar(scale);

  currentModel.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });

  scene.add(currentModel);

  const distance = 10;
  camera.position.set(distance, distance, distance);
  camera.lookAt(0, 0, 0);
}

function onMouseClick(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  if (!currentModel) return;

  raycaster.setFromCamera(mouse, camera);

  intersects = raycaster.intersectObject(currentModel, true);

  if (intersects.length > 0) {
    const intersect = intersects[0];

    const clickedMarker = checkMarkerClick(intersect.point);

    if (clickedMarker !== null) {
      selectMarker(clickedMarker);
    } else {
      addMarkerPoint(intersect.point, intersect.face.normal);
      console.log("Point coordinates:", intersect.point);
      showCoordinateNotification(intersect.point);
    }
  }
}

function showCoordinateNotification(point) {
  const notification = document.createElement("div");
  notification.style.position = "fixed";
  notification.style.top = "100px";
  notification.style.left = "50%";
  notification.style.transform = "translateX(-50%)";
  notification.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
  notification.style.color = "white";
  notification.style.padding = "10px 20px";
  notification.style.borderRadius = "5px";
  notification.style.zIndex = "1000";
  notification.style.transition = "opacity 0.5s";

  notification.textContent = `Point added at: (${point.x.toFixed(
    2
  )}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = "0";
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 500);
  }, 1000);
}

function checkMarkerClick(point) {
  for (let i = 0; i < markerPoints.length; i++) {
    const marker = markerPoints[i];
    const distance = point.distanceTo(marker.position);

    if (distance < markerParams.size * 1.5) {
      return i;
    }
  }

  return null;
}

function addMarkerPoint(position, normal) {
  const pointId = Date.now().toString();

  let geometry;

  switch (markerParams.shape) {
    case "cube":
      geometry = new THREE.BoxGeometry(
        markerParams.size,
        markerParams.size,
        markerParams.size
      );
      break;
    case "cone":
      geometry = new THREE.ConeGeometry(
        markerParams.size / 2,
        markerParams.size,
        16
      );
      break;
    case "sphere":
    default:
      geometry = new THREE.SphereGeometry(markerParams.size / 2, 16, 16);
      break;
  }

  const material = new THREE.MeshStandardMaterial({
    color: markerParams.color,
    transparent: true,
    opacity: 0.8,
  });

  const marker = new THREE.Mesh(geometry, material);
  marker.position.copy(position);

  if (markerParams.shape === "cone") {
    marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  }

  scene.add(marker);

  let label = null;

  if (markerParams.showLabels) {
    const labelDiv = document.createElement("div");
    labelDiv.className = "label";
    labelDiv.textContent = `${markerPoints.length + 1}`;
    labelDiv.style.color = "#ffffff";
    labelDiv.style.backgroundColor = "#00000080";
    labelDiv.style.padding = "2px 6px";
    labelDiv.style.borderRadius = "3px";
    labelDiv.style.fontSize = "12px";
    labelDiv.style.userSelect = "none";
    labelDiv.style.pointerEvents = "none";

    const labelObject = new CSS2DObject(labelDiv);
    labelObject.position.copy(position);
    labelObject.position.y += markerParams.size;

    scene.add(labelObject);
    label = labelObject;
  }

  const pointData = {
    id: pointId,
    position: position.clone(),
    normal: normal.clone(),
    marker: marker,
    label: label,
    name: `Point ${markerPoints.length + 1}`,
  };

  markerPoints.push(pointData);

  updatePointsList();

  return pointData;
}

function createInfoLabel(point, index) {
  removeInfoLabel();

  const infoDiv = document.createElement("div");
  infoDiv.className = "info-label";

  infoDiv.style.color = "#ffffff";
  infoDiv.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
  infoDiv.style.padding = "8px 16px";
  infoDiv.style.borderRadius = "5px";
  infoDiv.style.fontSize = "14px";
  infoDiv.style.userSelect = "none";
  infoDiv.style.pointerEvents = "none";
  infoDiv.style.display = "flex";
  infoDiv.style.alignItems = "center";
  infoDiv.style.minWidth = "150px";

  const numberSpan = document.createElement("span");
  numberSpan.textContent = `${index + 1}`;
  numberSpan.style.backgroundColor = "#ffffff";
  numberSpan.style.color = "#000000";
  numberSpan.style.borderRadius = "50%";
  numberSpan.style.width = "24px";
  numberSpan.style.height = "24px";
  numberSpan.style.display = "flex";
  numberSpan.style.alignItems = "center";
  numberSpan.style.justifyContent = "center";
  numberSpan.style.marginRight = "10px";
  numberSpan.style.fontWeight = "bold";

  const textSpan = document.createElement("span");
  textSpan.textContent = point.name;

  infoDiv.appendChild(numberSpan);
  infoDiv.appendChild(textSpan);

  const infoLabel = new CSS2DObject(infoDiv);
  infoLabel.position.copy(point.position);
  infoLabel.position.y += markerParams.size * 2;

  scene.add(infoLabel);
  activeInfoLabel = infoLabel;

  return infoLabel;
}

function removeInfoLabel() {
  if (activeInfoLabel) {
    scene.remove(activeInfoLabel);
    activeInfoLabel = null;
  }
}

function selectMarker(index) {
  if (selectedPoint !== null) {
    markerPoints[selectedPoint].marker.material.emissive.setHex(0x000000);
  }

  selectedPoint = index;
  markerPoints[selectedPoint].marker.material.emissive.setHex(0x333333);

  createInfoLabel(markerPoints[selectedPoint], selectedPoint);

  focusCameraOnPoint(markerPoints[selectedPoint].position);

  updatePointsList();

  const point = markerPoints[selectedPoint].position;
  console.log("Selected Point:", {
    index: selectedPoint,
    name: markerPoints[selectedPoint].name,
    coordinates: {
      x: point.x.toFixed(4),
      y: point.y.toFixed(4),
      z: point.z.toFixed(4),
    },
  });
}

function focusCameraOnPoint(position) {
  const offset = new THREE.Vector3(2, 1, 2);

  const startPosition = camera.position.clone();
  const targetPosition = position.clone().add(offset);
  const duration = 1000;
  const startTime = Date.now();

  function animateCamera() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    const easeProgress = 1 - Math.pow(1 - progress, 3);

    camera.position.lerpVectors(startPosition, targetPosition, easeProgress);

    controls.target.copy(position);
    controls.update();

    if (progress < 1) {
      requestAnimationFrame(animateCamera);
    }
  }

  animateCamera();
}

function updateMarkers() {
  markerPoints.forEach((point) => {
    point.marker.material.color.setHex(markerParams.color);

    let newGeometry;

    switch (markerParams.shape) {
      case "cube":
        newGeometry = new THREE.BoxGeometry(
          markerParams.size,
          markerParams.size,
          markerParams.size
        );
        break;
      case "cone":
        newGeometry = new THREE.ConeGeometry(
          markerParams.size / 2,
          markerParams.size,
          16
        );
        break;
      case "sphere":
      default:
        newGeometry = new THREE.SphereGeometry(markerParams.size / 2, 16, 16);
        break;
    }

    point.marker.geometry.dispose();
    point.marker.geometry = newGeometry;

    if (markerParams.shape === "cone") {
      point.marker.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        point.normal
      );
    } else {
      point.marker.quaternion.identity();
    }

    if (point.label) {
      point.label.visible = markerParams.showLabels;
      point.label.position.copy(point.position);
      point.label.position.y += markerParams.size;
    }
  });

  if (activeInfoLabel && selectedPoint !== null) {
    activeInfoLabel.position.copy(markerPoints[selectedPoint].position);
    activeInfoLabel.position.y += markerParams.size * 2;
  }
}

function clearPoints() {
  markerPoints.forEach((point) => {
    scene.remove(point.marker);
    if (point.label) {
      scene.remove(point.label);
    }
  });

  markerPoints = [];
  selectedPoint = null;
  removeInfoLabel();

  updatePointsList();
}

function exportPoints() {
  const pointsData = markerPoints.map((point, index) => {
    return {
      id: point.id,
      index: index,
      name: point.name,
      position: {
        x: point.position.x,
        y: point.position.y,
        z: point.position.z,
      },
      normal: {
        x: point.normal.x,
        y: point.normal.y,
        z: point.normal.z,
      },
    };
  });

  const dataStr = JSON.stringify(pointsData, null, 2);

  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "marker-points.json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function updatePointsList() {
  pointsList.innerHTML = "";

  markerPoints.forEach((point, index) => {
    const pointEntry = document.createElement("div");
    pointEntry.className = "point-entry";

    if (selectedPoint === index) {
      pointEntry.style.color = "#ffff00";
      pointEntry.style.fontWeight = "bold";
    }

    pointEntry.textContent = `${point.name}: (${point.position.x.toFixed(
      2
    )}, ${point.position.y.toFixed(2)}, ${point.position.z.toFixed(2)})`;

    pointEntry.addEventListener("click", () => {
      selectMarker(index);
    });

    pointsList.appendChild(pointEntry);
  });

  if (markerPoints.length === 0) {
    const noPoints = document.createElement("div");
    noPoints.textContent =
      "No points added yet. Click on the model to add points.";
    pointsList.appendChild(noPoints);
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
