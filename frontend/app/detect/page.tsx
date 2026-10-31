'use client';

import { useState, useRef, useCallback } from 'react';
import {
  detectVideo,
  type VideoDetectionResult,
  categoryIcon,
  API_BASE,
  type Detection,
} from '@/lib/api';
import { detectImageBrowser } from '@/lib/yoloBrowser';
import { supabaseInspectionService } from '@/lib/supabaseInspectionService';
import { useToast } from '@/contexts/ToastContext';

type Mode = 'image' | 'video';

interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

interface ZoomableImageProps {
  src: string;
  alt: string;
  label: string;
  state: ZoomState;
  onChange: (newState: ZoomState) => void;
  onReset: () => void;
  onExpand?: () => void;
}

function ZoomableImage({ src, alt, label, state, onChange, onReset, onExpand }: ZoomableImageProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (state.scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - state.x, y: e.clientY - state.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || state.scale <= 1) return;
    e.preventDefault();
    onChange({
      ...state,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    const newScale = Math.min(Math.max(1, Number((state.scale + delta).toFixed(2))), 5);
    onChange({
      scale: newScale,
      x: newScale === 1 ? 0 : state.x,
      y: newScale === 1 ? 0 : state.y,
    });
  };

  const zoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newScale = Math.min(5, Number((state.scale + 0.5).toFixed(2)));
    onChange({ ...state, scale: newScale });
  };

  const zoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newScale = Math.max(1, Number((state.scale - 0.5).toFixed(2)));
    onChange({
      scale: newScale,
      x: newScale === 1 ? 0 : state.x,
      y: newScale === 1 ? 0 : state.y,
    });
  };

  const handleDoubleClick = () => {
    if (state.scale > 1) {
      onReset();
    } else {
      onChange({ scale: 2, x: 0, y: 0 });
    }
  };

  return (
    <div
      ref={containerRef}
      className="zoomable-image-box"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      {/* Label Badge */}
      <div className="image-label" style={{ zIndex: 10 }}>
        {label}
      </div>

      {/* Floating Zoom Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(10, 16, 28, 0.85)',
          backdropFilter: 'blur(8px)',
          padding: '4px 8px',
          borderRadius: 20,
          border: '1px solid rgba(255, 255, 255, 0.12)',
          zIndex: 10,
          boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={zoomOut}
          disabled={state.scale <= 1}
          title="Alejar (-)"
          style={{
            background: 'none',
            border: 'none',
            color: state.scale <= 1 ? 'rgba(255,255,255,0.3)' : '#fff',
            cursor: state.scale <= 1 ? 'default' : 'pointer',
            fontSize: 14,
            padding: '2px 6px',
            borderRadius: 4,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          −
        </button>

        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'JetBrains Mono, monospace',
            color: state.scale > 1 ? 'var(--accent-blue-light)' : 'var(--text-secondary)',
            minWidth: 42,
            textAlign: 'center',
          }}
        >
          {Math.round(state.scale * 100)}%
        </span>

        <button
          type="button"
          onClick={zoomIn}
          disabled={state.scale >= 5}
          title="Acercar (+)"
          style={{
            background: 'none',
            border: 'none',
            color: state.scale >= 5 ? 'rgba(255,255,255,0.3)' : '#fff',
            cursor: state.scale >= 5 ? 'default' : 'pointer',
            fontSize: 14,
            padding: '2px 6px',
            borderRadius: 4,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          +
        </button>

        {state.scale > 1 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onReset(); }}
            title="Restablecer vista"
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 11,
              padding: '2px 6px',
              borderRadius: 4,
              lineHeight: 1,
            }}
          >
            ↺
          </button>
        )}

        {onExpand && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onExpand(); }}
            title="Ampliar en pantalla completa"
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 12,
              padding: '2px 4px',
              borderRadius: 4,
              lineHeight: 1,
            }}
          >
            ⛶
          </button>
        )}
      </div>

      {/* Helper text overlay */}
      {state.scale > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            color: 'var(--text-muted)',
            fontSize: 10,
            padding: '3px 10px',
            borderRadius: 12,
            pointerEvents: 'none',
            zIndex: 9,
          }}
        >
          Arrastra para mover · Rueda para zoom
        </div>
      )}

      {/* Rendered Image */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          transform: `translate(${state.x}px, ${state.y}px) scale(${state.scale})`,
          transition: isDragging ? 'none' : 'transform 0.12s ease-out',
          cursor: state.scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
          transformOrigin: 'center center',
          pointerEvents: 'auto',
        }}
      />
    </div>
  );
}

export default function DetectPage() {
  const { addToast } = useToast();
  const [mode, setMode] = useState<Mode>('image');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [conf, setConf] = useState(0.25);
  const [saveIncident, setSaveIncident] = useState(true);
  const [requiredPpe, setRequiredPpe] = useState<string[]>(['helmet', 'vest', 'gloves']);
  const [sampleRate, setSampleRate] = useState(30);
  const [imgResult, setImgResult] = useState<Awaited<ReturnType<typeof detectImageBrowser>> | null>(null);
  const [vidResult, setVidResult] = useState<VideoDetectionResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Zoom States
  const [zoomOrig, setZoomOrig] = useState<ZoomState>({ scale: 1, x: 0, y: 0 });
  const [zoomRes, setZoomRes] = useState<ZoomState>({ scale: 1, x: 0, y: 0 });
  const [syncZoom, setSyncZoom] = useState(true);
  const [fullscreenModal, setFullscreenModal] = useState(false);

  const accept = mode === 'image'
    ? 'image/jpeg,image/png,image/webp,image/jpg'
    : 'video/mp4,video/avi,video/mov,video/mkv,video/webm';

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setImgResult(null);
    setVidResult(null);
    setZoomOrig({ scale: 1, x: 0, y: 0 });
    setZoomRes({ scale: 1, x: 0, y: 0 });
    if (mode === 'image') {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  }, [mode]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const [supabaseSyncStatus, setSupabaseSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');

  const handleDetect = async () => {
    if (!file) return;
    setLoading(true);
    setSupabaseSyncStatus('idle');
    try {
      if (mode === 'image') {
        const result = await detectImageBrowser(file, conf, requiredPpe);
        setImgResult(result);
        setZoomOrig({ scale: 1, x: 0, y: 0 });
        setZoomRes({ scale: 1, x: 0, y: 0 });
        addToast({
          type: result.has_violations ? 'warning' : 'success',
          title: result.has_violations ? '⚠️ Violaciones detectadas' : '✅ Análisis completado',
          message: `${result.total_detections} detección(es) — Cumplimiento: ${result.compliance_rate}%`,
        });

        // Sincronización automática con Supabase (App Móvil & Web)
        setSupabaseSyncStatus('syncing');
        try {
          const img = new Image();
          img.src = preview || URL.createObjectURL(file);
          await new Promise(r => { img.onload = r; img.onerror = r; });

          await supabaseInspectionService.saveInspection({
            file,
            imageWidth: result.image_width || img.naturalWidth || 640,
            imageHeight: result.image_height || img.naturalHeight || 640,
            inferenceTimeMs: 120,
            totalDetections: result.total_detections,
            complianceSummary: {
              complianceRate: result.compliance_rate,
              compliance_rate: result.compliance_rate,
              hasViolations: result.has_violations,
              has_violations: result.has_violations,
              personsCount: result.persons_count,
              persons_count: result.persons_count,
              ppeCount: result.ppe_count,
              ppe_count: result.ppe_count,
              violationsCount: (result.detections || []).filter(d => d.is_violation).length,
              violations_count: (result.detections || []).filter(d => d.is_violation).length,
              missingItems: result.missing_ppe || [],
              violations: (result.detections || []).filter(d => d.is_violation).map(d => d.label),
            },
            detections: result.detections,
          });
          setSupabaseSyncStatus('synced');
          addToast({
            type: 'success',
            title: '☁️ Sincronizado en Supabase',
            message: 'Inspección guardada y disponible en tu App Móvil.',
          });
        } catch (sErr: any) {
          console.warn('Sync a Supabase:', sErr);
          setSupabaseSyncStatus('error');
        }
      } else {
        const result = await detectVideo(file, conf, sampleRate);
        setVidResult(result);
        addToast({ type: 'success', title: '🎬 Video procesado', message: `${result.frames_analyzed} frames analizados` });

        // Sincronización automática de Video en Supabase (Visible en App Móvil)
        setSupabaseSyncStatus('syncing');
        try {
          const thumbUrl = result.thumbnail_file
            ? `${API_BASE}${result.thumbnail_file}`
            : `${API_BASE}${result.result_file}`;
          const thumbBlob = await fetch(thumbUrl).then(r => r.blob());

          await supabaseInspectionService.saveInspection({
            file: thumbBlob,
            imageWidth: result.image_width || 1280,
            imageHeight: result.image_height || 720,
            inferenceTimeMs: 250,
            totalDetections: (result.ppe_count || 0) + (result.violations_count || 0),
            complianceSummary: {
              complianceRate: result.compliance_rate ?? (result.has_violations ? 50 : 100),
              compliance_rate: result.compliance_rate ?? (result.has_violations ? 50 : 100),
              hasViolations: Boolean(result.has_violations),
              has_violations: Boolean(result.has_violations),
              personsCount: result.persons_count || result.summary.unique_persons || 1,
              persons_count: result.persons_count || result.summary.unique_persons || 1,
              ppeCount: result.ppe_count || result.summary.ppe_detections || 0,
              ppe_count: result.ppe_count || result.summary.ppe_detections || 0,
              violationsCount: result.violations_count || 0,
              violations_count: result.violations_count || 0,
              violations: result.has_violations ? ['Posible infracción en video'] : [],
              missingItems: [],
            },
            detections: result.detections || [],
          });
          setSupabaseSyncStatus('synced');
          addToast({
            type: 'success',
            title: '📱 Video sincronizado en App Móvil',
            message: 'La inspección de video ya está disponible en tu App Móvil.',
          });
        } catch (sErr: any) {
          console.warn('Sync de video a Supabase:', sErr);
          setSupabaseSyncStatus('error');
        }
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error en detección', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setImgResult(null);
    setVidResult(null);
    setSupabaseSyncStatus('idle');
    setZoomOrig({ scale: 1, x: 0, y: 0 });
    setZoomRes({ scale: 1, x: 0, y: 0 });
    if (fileInput.current) fileInput.current.value = '';
  };

  // Zoom handlers with optional sync
  const handleOrigZoomChange = (newState: ZoomState) => {
    setZoomOrig(newState);
    if (syncZoom) {
      setZoomRes(newState);
    }
  };

  const handleResZoomChange = (newState: ZoomState) => {
    setZoomRes(newState);
    if (syncZoom) {
      setZoomOrig(newState);
    }
  };

  const resetAllZoom = () => {
    setZoomOrig({ scale: 1, x: 0, y: 0 });
    setZoomRes({ scale: 1, x: 0, y: 0 });
  };

  return (
    <div className="page-content">
      <div className="page-header-responsive">
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
            Estudio de Detección
          </h2>
          <p className="text-secondary text-sm" style={{ marginTop: 4 }}>
            Analiza imágenes y videos para detección de EPP en tiempo real
          </p>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="tabs">
        {(['image', 'video'] as Mode[]).map(m => (
          <button key={m} className={`tab ${mode === m ? 'active' : ''}`}
            onClick={() => { setMode(m); reset(); }}>
            {m === 'image' ? '🖼️ Imagen' : '🎬 Video'}
          </button>
        ))}
      </div>

      <div className="detect-workspace-grid">
        {/* Left Panel: Controls */}
        <div>
          <div className="card mb-4">
            <div className="card-title mb-4">Cargar {mode === 'image' ? 'Imagen' : 'Video'}</div>

            {/* Hidden Input */}
            <input
              ref={fileInput}
              type="file"
              accept={accept}
              style={{ display: 'none' }}
              onChange={onFileChange}
            />

            {/* PRELOAD VIEW FOR IMAGE: Only image centered + name below */}
            {mode === 'image' && file && preview ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div
                  style={{
                    width: '100%',
                    position: 'relative',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                    background: '#040711',
                    border: '1px solid var(--border)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 240,
                    maxHeight: 300,
                    padding: 8,
                  }}
                  onClick={() => fileInput.current?.click()}
                  title="Haz clic para seleccionar otra imagen"
                >
                  <img
                    src={preview}
                    alt="Imagen precargada"
                    style={{
                      maxWidth: '100%',
                      maxHeight: 280,
                      objectFit: 'contain',
                      borderRadius: 6,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 10,
                      right: 10,
                      background: 'rgba(10, 16, 28, 0.85)',
                      backdropFilter: 'blur(6px)',
                      color: 'var(--text-secondary)',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 20,
                      border: '1px solid rgba(255,255,255,0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span>🔄 Cambiar</span>
                  </div>
                </div>

                {/* File Name Directly Below */}
                <div
                  style={{
                    width: '100%',
                    marginTop: 12,
                    padding: '10px 14px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      fontFamily: 'JetBrains Mono, monospace',
                      wordBreak: 'break-all',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <span>🖼️</span>
                    <span>{file.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              </div>
            ) : (
              /* Standard Upload Drop Zone */
              <div
                className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
                style={{ padding: 32 }}
                onClick={() => fileInput.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <div className="upload-zone-icon">{mode === 'image' ? '🖼️' : '🎬'}</div>
                {file ? (
                  <div>
                    <h3 style={{ fontSize: 14, wordBreak: 'break-all' }}>{file.name}</h3>
                    <p style={{ marginTop: 8 }}>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                ) : (
                  <div>
                    <h3>Arrastra o haz clic para seleccionar</h3>
                    <p>Sube tu {mode === 'image' ? 'imagen' : 'video'} para analizar</p>
                    <div className="upload-types" style={{ marginTop: 12 }}>
                      {mode === 'image'
                        ? ['JPG', 'PNG', 'WEBP'].map(t => <span key={t} className="upload-type-badge">{t}</span>)
                        : ['MP4', 'AVI', 'MOV', 'MKV'].map(t => <span key={t} className="upload-type-badge">{t}</span>)
                      }
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Config Panel */}
          <div className="card">
            <div className="card-title mb-4">Configuración</div>

            <div className="form-group">
              <label className="form-label">Umbral de confianza: <strong>{conf}</strong></label>
              <input type="range" min="0.1" max="0.9" step="0.05" value={conf}
                onChange={e => setConf(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent-blue)', cursor: 'pointer' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                <span>0.1 (sensible)</span>
                <span>0.9 (estricto)</span>
              </div>
            </div>

            {mode === 'video' && (
              <div className="form-group">
                <label className="form-label">Analizar cada <strong>{sampleRate}</strong> frame(s)</label>
                <input type="range" min="1" max="60" step="1" value={sampleRate}
                  onChange={e => setSampleRate(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }} />
              </div>
            )}

            {mode === 'image' && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: 8 }}>
                    EPP Obligatorio para el personal:
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      { key: 'helmet', label: '🪖 Casco' },
                      { key: 'vest', label: '🦺 Chaleco' },
                      { key: 'gloves', label: '🧤 Guantes' },
                      { key: 'boots', label: '🥾 Botas' },
                      { key: 'goggles', label: '🥽 Gafas' },
                    ].map(item => {
                      const active = requiredPpe.includes(item.key);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            setRequiredPpe(prev =>
                              active ? prev.filter(k => k !== item.key) : [...prev, item.key]
                            );
                          }}
                          style={{
                            fontSize: 12,
                            padding: '4px 10px',
                            borderRadius: 14,
                            cursor: 'pointer',
                            border: `1px solid ${active ? 'var(--accent-blue)' : 'var(--border)'}`,
                            background: active ? 'rgba(56, 189, 248, 0.18)' : 'var(--bg-secondary)',
                            color: active ? '#ffffff' : 'var(--text-muted)',
                            fontWeight: active ? 600 : 400,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                    <input type="checkbox" checked={saveIncident} onChange={e => setSaveIncident(e.target.checked)}
                      style={{ accentColor: 'var(--accent-blue)', width: 16, height: 16 }} />
                    <span className="text-secondary">Guardar como incidente si hay infracción</span>
                  </label>
                </div>
              </>
            )}

            <button
              id="btn-detect"
              className="btn btn-primary w-full"
              style={{ marginTop: 8 }}
              onClick={handleDetect}
              disabled={!file || loading}
            >
              {loading ? (
                <><span className="loading-spinner" /> Analizando...</>
              ) : (
                <>{mode === 'image' ? '🔍 Detectar EPP' : '▶️ Procesar Video'}</>
              )}
            </button>

            {file && (
              <button className="btn btn-ghost w-full" style={{ marginTop: 8 }} onClick={reset}>
                🗑️ Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Right Panel: Results */}
        <div>
          {!imgResult && !vidResult && !loading && (
            <div className="card" style={{ height: '100%', minHeight: 400 }}>
              <div className="empty-state" style={{ height: '100%' }}>
                <div className="empty-state-icon">🎯</div>
                <h3>Listo para analizar</h3>
                <p>Sube una {mode === 'image' ? 'imagen' : 'video'} y presiona "Detectar EPP"</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="card" style={{ height: '100%', minHeight: 400, position: 'relative' }}>
              <div className="loading-overlay">
                <div className="loading-spinner" style={{ width: 48, height: 48 }} />
                <div className="loading-text">
                  {mode === 'image' ? 'Ejecutando inferencia...' : 'Procesando video, puede tardar un momento...'}
                </div>
              </div>
            </div>
          )}

          {/* Image Result */}
          {imgResult && !loading && (
            <div>
              {/* Compliance Banner */}
              <div className={`card mb-4`} style={{ padding: '16px 22px' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: 28 }}>
                      {imgResult.compliance_rate >= 80 ? '✅' : imgResult.compliance_rate >= 50 ? '⚠️' : '🚨'}
                    </span>
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>CUMPLIMIENTO EPP</div>
                      <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{imgResult.compliance_rate}%</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 20, textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-blue-light)' }}>{imgResult.persons_count}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Personas</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-green)' }}>{imgResult.ppe_count}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>EPP Det.</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-yellow)' }}>{imgResult.total_detections}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total</div>
                    </div>
                  </div>
                </div>

                {imgResult.missing_ppe && imgResult.missing_ppe.length > 0 && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: '10px 14px',
                      background: 'rgba(239, 68, 68, 0.08)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-red)' }}>
                      ⚠️ EPP Faltante obligatorio:
                    </span>
                    {imgResult.missing_ppe.map((item, idx) => (
                      <span
                        key={idx}
                        className="badge badge-critical"
                        style={{ fontSize: 11, padding: '2px 8px' }}
                      >
                        {item === 'helmet' ? '🪖 Sin Casco' : item === 'vest' ? '🦺 Sin Chaleco' : item === 'gloves' ? '🧤 Sin Guantes' : item === 'boots' ? '🥾 Sin Botas' : item === 'goggles' ? '🥽 Sin Gafas' : `Sin ${item}`}
                      </span>
                    ))}
                  </div>
                )}

                {supabaseSyncStatus === 'synced' && (
                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 10,
                      borderTop: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <span style={{ color: 'var(--accent-green-light)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>📱</span> Sincronizado en Supabase (Visible en App Móvil)
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                      Tabla: inspections · Bucket: inspection-images
                    </span>
                  </div>
                )}

                {supabaseSyncStatus === 'syncing' && (
                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 10,
                      borderTop: '1px solid var(--border)',
                      fontSize: 12,
                      color: 'var(--accent-cyan)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>☁️</span> Sincronizando inspección con Supabase...
                  </div>
                )}
              </div>

              {/* Comparison Header with Zoom Controls */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 14px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🔍</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Vista Comparativa (Zoom Interactivo)
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                      color: syncZoom ? 'var(--accent-blue-light)' : 'var(--text-secondary)',
                      fontWeight: 600,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={syncZoom}
                      onChange={e => setSyncZoom(e.target.checked)}
                      style={{ accentColor: 'var(--accent-blue)' }}
                    />
                    🔗 Sincronizar Zoom
                  </label>
                  {(zoomOrig.scale > 1 || zoomRes.scale > 1) && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={resetAllZoom}
                      style={{ fontSize: 11, padding: '2px 8px' }}
                    >
                      ↺ Restablecer Vistas
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setFullscreenModal(true)}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                  >
                    ⛶ Pantalla Completa
                  </button>
                </div>
              </div>

              {/* Images side by side with Zoom */}
              <div className="detection-grid mb-4">
                <div>
                  {preview && (
                    <ZoomableImage
                      src={preview}
                      alt="original"
                      label="Original"
                      state={zoomOrig}
                      onChange={handleOrigZoomChange}
                      onReset={() => {
                        setZoomOrig({ scale: 1, x: 0, y: 0 });
                        if (syncZoom) setZoomRes({ scale: 1, x: 0, y: 0 });
                      }}
                      onExpand={() => setFullscreenModal(true)}
                    />
                  )}
                </div>
                <div>
                  <ZoomableImage
                    src={imgResult.annotated_url}
                    alt="resultado"
                    label="Resultado con detecciones"
                    state={zoomRes}
                    onChange={handleResZoomChange}
                    onReset={() => {
                      setZoomRes({ scale: 1, x: 0, y: 0 });
                      if (syncZoom) setZoomOrig({ scale: 1, x: 0, y: 0 });
                    }}
                    onExpand={() => setFullscreenModal(true)}
                  />
                </div>
              </div>

              {/* Detections List */}
              {imgResult.detections.length > 0 && (
                <div className="card">
                  <div className="card-title mb-4">Objetos Detectados ({imgResult.detections.length})</div>
                  <div className="detections-list">
                    {imgResult.detections.map((d, i) => (
                      <div key={i} className="detection-item">
                        <div className="detection-label">
                          <span style={{ fontSize: 20 }}>{categoryIcon(d.category)}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{d.label}</div>
                            <div className="detection-category">{d.category}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="confidence-bar">
                            <div className="confidence-fill" style={{ width: `${d.confidence * 100}%` }} />
                          </div>
                          <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)', minWidth: 36 }}>
                            {(d.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Video Result */}
          {vidResult && !loading && (
            <div>
              <div className="card mb-4">
                <div className="flex items-center gap-3 mb-4">
                  <span style={{ fontSize: 28 }}>🎬</span>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>VIDEO PROCESADO</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {vidResult.frames_analyzed} de {vidResult.total_frames} frames analizados
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ textAlign: 'center', padding: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-blue-light)' }}>{vidResult.summary.unique_persons}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Personas únicas</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-green)' }}>{vidResult.summary.ppe_detections}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Detecciones EPP</div>
                  </div>
                </div>

                {supabaseSyncStatus === 'synced' && (
                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 10,
                      borderTop: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <span style={{ color: 'var(--accent-green-light)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>📱</span> Sincronizado en Supabase (Visible en App Móvil)
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                      Tabla: inspections · Portada en Storage
                    </span>
                  </div>
                )}
              </div>
              <div className="card">
                <div className="card-title mb-4">Video Anotado</div>
                <video controls style={{ width: '100%', borderRadius: 'var(--radius)', background: '#000' }}
                  src={`${API_BASE}${vidResult.result_file}`} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FULLSCREEN LIGHTBOX MODAL */}
      {fullscreenModal && imgResult && (
        <div
          className="modal-overlay"
          style={{ zIndex: 9999, background: 'rgba(3, 6, 15, 0.92)', backdropFilter: 'blur(12px)', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setFullscreenModal(false); }}
        >
          <div
            style={{
              width: '95vw',
              maxWidth: 1400,
              height: '90vh',
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 24px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22 }}>🔍</span>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                    Inspección en Alta Resolución
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Haz zoom con la rueda del ratón o los botones y arrastra para examinar detalles
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    cursor: 'pointer',
                    color: syncZoom ? 'var(--accent-blue-light)' : 'var(--text-secondary)',
                    fontWeight: 600,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={syncZoom}
                    onChange={e => setSyncZoom(e.target.checked)}
                    style={{ accentColor: 'var(--accent-blue)' }}
                  />
                  🔗 Sincronizar Vistas
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={resetAllZoom}
                >
                  ↺ Restablecer
                </button>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setFullscreenModal(false)}
                  style={{ fontSize: 20 }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Image Body */}
            <div
              style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
                padding: 16,
                overflow: 'hidden',
                background: '#03050c',
              }}
            >
              {preview && (
                <ZoomableImage
                  src={preview}
                  alt="original"
                  label="Original"
                  state={zoomOrig}
                  onChange={handleOrigZoomChange}
                  onReset={() => {
                    setZoomOrig({ scale: 1, x: 0, y: 0 });
                    if (syncZoom) setZoomRes({ scale: 1, x: 0, y: 0 });
                  }}
                />
              )}
              <ZoomableImage
                src={imgResult.annotated_url}
                alt="resultado"
                label="Resultado con detecciones"
                state={zoomRes}
                onChange={handleResZoomChange}
                onReset={() => {
                  setZoomRes({ scale: 1, x: 0, y: 0 });
                  if (syncZoom) setZoomOrig({ scale: 1, x: 0, y: 0 });
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}