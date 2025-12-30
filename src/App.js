import React, { useState, useRef, useEffect } from 'react';
import { Upload, Plus, Edit2, Trash2, X, RotateCw } from 'lucide-react';
import * as THREE from 'three';

export default function PanoramicViewer() {
  const [currentPano, setCurrentPano] = useState(null);
  const [hotspots, setHotspots] = useState([]);
  const [isAddingHotspot, setIsAddingHotspot] = useState(false);
  const [editingHotspot, setEditingHotspot] = useState(null);
  const [fov, setFov] = useState(75);
  const [hoveredHotspot, setHoveredHotspot] = useState(null);

  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const sphereRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const hotspotMeshesRef = useRef([]);
  const isDraggingRef = useRef(false);
  const lastInteractionTimeRef = useRef(Date.now());
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const animationIdRef = useRef(null);
  const targetRotationRef = useRef({ x: 0, y: 0 });
  const currentRotationRef = useRef({ x: 0, y: 0 });

  // Scene Setup
  useEffect(() => {
    if (!containerRef.current || !currentPano) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(fov, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 0.1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);

    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);

    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(currentPano.url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      renderer.render(scene, camera);
    });

    const material = new THREE.MeshBasicMaterial({ map: texture });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    sphereRef.current = sphere;

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      currentRotationRef.current.x += (targetRotationRef.current.x - currentRotationRef.current.x) * 0.1;
      currentRotationRef.current.y += (targetRotationRef.current.y - currentRotationRef.current.y) * 0.1;
      camera.rotation.order = 'YXZ';
      camera.rotation.x = currentRotationRef.current.x;
      camera.rotation.y = currentRotationRef.current.y;

      const timeSinceLastInteraction = Date.now() - lastInteractionTimeRef.current;
      if (timeSinceLastInteraction > 3000 && !isDraggingRef.current) {
        targetRotationRef.current.y += 0.001;
      }

      hotspotMeshesRef.current.forEach(mesh => {
        const s = 1 + Math.sin(Date.now() * 0.005) * 0.2;
        mesh.scale.set(s, s, s);
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationIdRef.current);
      if (containerRef.current) containerRef.current.innerHTML = '';
      geometry.dispose();
      material.dispose();
      texture.dispose();
    };
  }, [currentPano]);

  // Update Hotspot Meshes
  useEffect(() => {
    if (!sceneRef.current) return;
    hotspotMeshesRef.current.forEach(mesh => sceneRef.current.remove(mesh));
    hotspotMeshesRef.current = [];

    hotspots.forEach(h => {
      const geo = new THREE.SphereGeometry(6, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff4757, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(h.position.x, h.position.y, h.position.z);
      mesh.userData = { hotspotId: h.id };
      sceneRef.current.add(mesh);
      hotspotMeshesRef.current.push(mesh);
    });
  }, [hotspots]);

  // Interaction Handler (Mouse Move, Click, Zoom)
  useEffect(() => {
    if (!rendererRef.current) return;
    const canvas = rendererRef.current.domElement;

    const resetInactivity = () => { lastInteractionTimeRef.current = Date.now(); };

    const onMouseDown = (e) => {
      isDraggingRef.current = true;
      resetInactivity();
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e) => {
      resetInactivity();
      if (isDraggingRef.current) {
        const deltaX = e.clientX - previousMousePositionRef.current.x;
        const deltaY = e.clientY - previousMousePositionRef.current.y;
        targetRotationRef.current.y += deltaX * 0.002;
        targetRotationRef.current.x += deltaY * 0.002;
        targetRotationRef.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotationRef.current.x));
        previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
      }

      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycasterRef.current.setFromCamera(mouse, cameraRef.current);
      const intersects = raycasterRef.current.intersectObjects(hotspotMeshesRef.current);
      if (intersects.length > 0) {
        setHoveredHotspot(intersects[0].object.userData.hotspotId);
        canvas.style.cursor = 'pointer';
      } else {
        setHoveredHotspot(null);
        canvas.style.cursor = isAddingHotspot ? 'crosshair' : 'grab';
      }
    };

    const onMouseUp = () => { isDraggingRef.current = false; };

    const onWheel = (e) => {
      resetInactivity();
      setFov(prev => {
        const newFov = Math.max(30, Math.min(100, prev + e.deltaY * 0.05));
        if (cameraRef.current) {
          cameraRef.current.fov = newFov;
          cameraRef.current.updateProjectionMatrix();
        }
        return newFov;
      });
    };

    const onClick = (e) => {
      // Agar drag kar rahe hain toh click ignore karein
      if (isDraggingRef.current) return;

      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycasterRef.current.setFromCamera(mouse, cameraRef.current);

      // Check click on existing hotspot
      const hotspotIntersects = raycasterRef.current.intersectObjects(hotspotMeshesRef.current);
      if (hotspotIntersects.length > 0) {
        const hotspot = hotspots.find(h => h.id === hotspotIntersects[0].object.userData.hotspotId);
        if (hotspot) setEditingHotspot(hotspot);
        return;
      }

      // Add New Hotspot Logic
      if (isAddingHotspot && sphereRef.current) {
        const sphereIntersects = raycasterRef.current.intersectObject(sphereRef.current);
        if (sphereIntersects.length > 0) {
          const p = sphereIntersects[0].point;
          const newH = { 
            id: Date.now(), 
            position: { x: p.x, y: p.y, z: p.z }, 
            label: '', 
            description: '' 
          };
          setHotspots(prev => [...prev, newH]);
          setEditingHotspot(newH);
          setIsAddingHotspot(false);
        }
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('click', onClick);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('click', onClick);
    };
  }, [isAddingHotspot, hotspots]); // Dependencies are crucial here!

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCurrentPano({ id: Date.now(), url: ev.target.result });
        setHotspots([]);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="h-screen w-full bg-gray-900 flex flex-col overflow-hidden">
      <div className="bg-gray-800 border-b border-gray-700 p-4 flex items-center justify-between z-10">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <RotateCw size={24} className="text-blue-500" /> 360° Studio
        </h1>
        <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all">
          <Upload size={18} /> Upload <input type="file" hidden onChange={handleImageUpload} />
        </label>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {currentPano && (
          <div className="w-72 bg-gray-800 border-r border-gray-700 p-4 flex flex-col gap-4 overflow-y-auto">
            <button 
              onClick={() => setIsAddingHotspot(!isAddingHotspot)} 
              className={`w-full py-3 rounded-lg flex items-center justify-center gap-2 font-bold ${isAddingHotspot ? 'bg-orange-600 animate-pulse' : 'bg-purple-600'} text-white transition-colors`}
            >
              <Plus size={18}/> {isAddingHotspot ? 'Click on Viewer' : 'Add Hotspot'}
            </button>

            <div className="flex-1">
              <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-4">Saved Hotspots</h3>
              <div className="space-y-2">
                {hotspots.map(h => (
                  <div key={h.id} className={`p-3 rounded-lg flex justify-between items-center group transition-all ${hoveredHotspot === h.id ? 'bg-blue-900/40 ring-1 ring-blue-500' : 'bg-gray-700 hover:bg-gray-600'}`}>
                    <span className="text-white text-sm truncate">{h.label || 'Unnamed Point'}</span>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Edit2 size={14} className="text-gray-400 cursor-pointer hover:text-white" onClick={() => setEditingHotspot(h)}/>
                      <Trash2 size={14} className="text-red-400 cursor-pointer hover:text-red-300" onClick={() => setHotspots(hotspots.filter(x => x.id !== h.id))}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 relative bg-black">
          {!currentPano ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
              <Upload size={64} className="mb-4 opacity-20" />
              <p className="text-lg">Please upload a 360° image</p>
            </div>
          ) : (
            <>
              <div ref={containerRef} className="w-full h-full" />
              {isAddingHotspot && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-orange-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg animate-bounce">
                  Click on the image to place hotspot
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {editingHotspot && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 p-6 rounded-xl w-full max-w-sm border border-gray-700">
            <h3 className="text-white font-bold mb-4">Hotspot Details</h3>
            <input 
              className="w-full bg-gray-700 text-white p-3 rounded-lg mb-4 outline-none focus:ring-2 focus:ring-blue-500" 
              placeholder="Point Label..." 
              value={editingHotspot.label}
              onChange={e => setEditingHotspot({...editingHotspot, label: e.target.value})}
            />
            <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold" onClick={() => {
              setHotspots(prev => prev.map(h => h.id === editingHotspot.id ? editingHotspot : h));
              setEditingHotspot(null);
            }}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}