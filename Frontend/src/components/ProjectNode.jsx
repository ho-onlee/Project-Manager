// ProjectNode.jsx
import * as THREE from 'three';

export default class ProjectNode {
  constructor({ id, label, x, y, onDoubleClick }) {
    this.id = id;
    this.label = label;
    this.onDoubleClick = onDoubleClick;

    this.group = new THREE.Group();
    this.group.position.set(x, y, 0);

    // 🔲 Rounded rectangle = solar system container
    const w = 260;   // width of container
    const h = 200;   // height of container
    const r = 30;    // corner radius

    this.bounds = { width: w, height: h }; // used for zoom-to-fit

    const shape = new THREE.Shape();
    shape.moveTo(-w/2 + r, -h/2);
    shape.lineTo(w/2 - r, -h/2);
    shape.quadraticCurveTo(w/2, -h/2, w/2, -h/2 + r);
    shape.lineTo(w/2, h/2 - r);
    shape.quadraticCurveTo(w/2, h/2, w/2 - r, h/2);
    shape.lineTo(-w/2 + r, h/2);
    shape.quadraticCurveTo(-w/2, h/2, -w/2, h/2 - r);
    shape.lineTo(-w/2, -h/2 + r);
    shape.quadraticCurveTo(-w/2, -h/2, -w/2 + r, -h/2);

    const borderGeo = new THREE.ShapeGeometry(shape);
    const borderMat = new THREE.MeshBasicMaterial({
      color: 0x222222,
      opacity: 0.9,
      transparent: true
    });

    const borderMesh = new THREE.Mesh(borderGeo, borderMat);
    borderMesh.position.set(0, 0, -1);
    this.group.add(borderMesh);

    // ☀ Core circle (double‑click target)
    const coreGeo = new THREE.CircleGeometry(40, 32);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    this.core = new THREE.Mesh(coreGeo, coreMat);
    this.core.position.set(0, 0, 1);
    this.group.add(this.core);

    // Label
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = "32px Arial";
    ctx.fillStyle = "white";
    ctx.fillText(label, 10, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture });
    const labelSprite = new THREE.Sprite(spriteMat);
    labelSprite.scale.set(260, 60, 1);
    labelSprite.position.set(0, h/2 + 40, 2);

    this.group.add(labelSprite);
  }

  handleDoubleClick() {
    console.log("ProjectNode double‑clicked:", this.id);
    if (this.onDoubleClick) {
      this.onDoubleClick(this.id);
    }
  }

  get object3D() {
    return this.group;
  }
}
