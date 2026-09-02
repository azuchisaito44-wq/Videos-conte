const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));
app.use('/', express.static(path.join(__dirname, 'public')));

const TMP_DIR = path.join(__dirname, 'tmp');
const OUT_DIR = path.join(__dirname, 'outputs');
const FONT_PATH = path.join(__dirname, 'fonts', 'font.ttf');

fs.ensureDirSync(TMP_DIR);
fs.ensureDirSync(OUT_DIR);

const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB por archivo
});

// Escapa texto para que ffmpeg drawtext no se rompa con comillas/dos puntos
function escapeText(txt) {
  return String(txt || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\u2019")
    .replace(/%/g, '\\%');
}

// Convierte una imagen en un clip de video de N segundos, 1080x1920, con texto opcional
function imagenAClip(inputPath, outputPath, duracion, texto) {
  return new Promise((resolve, reject) => {
    let vf = [
      "scale=1080:1920:force_original_aspect_ratio=increase",
      "crop=1080:1920",
      "fade=t=in:st=0:d=0.4",
      `fade=t=out:st=${Math.max(duracion - 0.4, 0)}:d=0.4`
    ];

    if (texto && texto.trim()) {
      const hasFont = fs.existsSync(FONT_PATH);
      const fontOpt = hasFont ? `fontfile='${FONT_PATH}':` : '';
      vf.push(
        `drawtext=${fontOpt}text='${escapeText(texto)}':fontcolor=white:fontsize=54:` +
        `box=1:boxcolor=black@0.45:boxborderw=24:x=(w-text_w)/2:y=h-th-160:` +
        `line_spacing=8`
      );
    }

    ffmpeg(inputPath)
      .loop(duracion)
      .videoFilters(vf)
      .outputOptions(['-t', String(duracion), '-r', '30', '-pix_fmt', 'yuv420p'])
      .noAudio()
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

// Re-normaliza un clip de video subido (celular) al mismo formato 1080x1920/30fps
function normalizarClip(inputPath, outputPath, duracionMax) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath)
      .videoFilters([
        "scale=1080:1920:force_original_aspect_ratio=increase",
        "crop=1080:1920"
      ])
      .outputOptions(['-r', '30', '-pix_fmt', 'yuv420p'])
      .noAudio()
      .output(outputPath);

    if (duracionMax) cmd.outputOptions(['-t', String(duracionMax)]);

    cmd.on('end', resolve).on('error', reject).run();
  });
}

function concatenarClips(listaTxtPath, clipsOutputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listaTxtPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy'])
      .output(clipsOutputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function agregarAudio(videoPath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        '-map', '0:v:0',
        '-map', '1:a:0'
      ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

/**
 * POST /generar-video
 * multipart/form-data:
 *   - archivos: uno o mas (imagenes .jpg/.png o clips .mp4), EN ORDEN
 *   - audio: opcional, un archivo de audio (voz/musica) para todo el video
 *   - escenas: JSON string, array [{ "texto": "...", "duracion": 3 }, ...]
 *              (debe tener el mismo largo/orden que "archivos"; duracion en segundos,
 *              se ignora para clips de video que ya traen su propia duracion)
 */
app.post('/generar-video', upload.fields([
  { name: 'archivos', maxCount: 30 },
  { name: 'audio', maxCount: 1 }
]), async (req, res) => {
  const jobId = uuidv4();
  const jobTmp = path.join(TMP_DIR, jobId);
  await fs.ensureDir(jobTmp);

  try {
    const archivos = req.files['archivos'] || [];
    const audioFile = (req.files['audio'] || [])[0];
    if (archivos.length === 0) {
      return res.status(400).json({ error: 'Debes subir al menos una imagen o clip en "archivos".' });
    }

    let escenas = [];
    try {
      escenas = JSON.parse(req.body.escenas || '[]');
    } catch (e) {
      escenas = [];
    }

    const clipPaths = [];
    for (let i = 0; i < archivos.length; i++) {
      const file = archivos[i];
      const escena = escenas[i] || {};
      const duracion = Number(escena.duracion) > 0 ? Number(escena.duracion) : 3;
      const ext = path.extname(file.originalname).toLowerCase();
      const esVideo = ['.mp4', '.mov', '.webm', '.mkv'].includes(ext);
      const clipOut = path.join(jobTmp, `clip_${i}.mp4`);

      if (esVideo) {
        await normalizarClip(file.path, clipOut, duracion || null);
      } else {
        await imagenAClip(file.path, clipOut, duracion, escena.texto);
      }
      clipPaths.push(clipOut);
    }

    // Lista para concat demuxer
    const listaPath = path.join(jobTmp, 'lista.txt');
    const listaContenido = clipPaths.map(p => `file '${p}'`).join('\n');
    await fs.writeFile(listaPath, listaContenido);

    const clipsUnidos = path.join(jobTmp, 'unido.mp4');
    await concatenarClips(listaPath, clipsUnidos);

    const finalNombre = `lavadoyapoo_ad_${jobId}.mp4`;
    const finalPath = path.join(OUT_DIR, finalNombre);

    if (audioFile) {
      await agregarAudio(clipsUnidos, audioFile.path, finalPath);
    } else {
      await fs.copy(clipsUnidos, finalPath);
    }

    await fs.remove(jobTmp);
    for (const f of archivos) await fs.remove(f.path).catch(() => {});
    if (audioFile) await fs.remove(audioFile.path).catch(() => {});

    res.json({
      ok: true,
      video_url: `/outputs/${finalNombre}`,
      mensaje: 'Video generado correctamente.'
    });
  } catch (err) {
    console.error('Error generando video:', err);
    await fs.remove(jobTmp).catch(() => {});
    res.status(500).json({ error: 'Error al generar el video.', detalle: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor de videos publicitarios corriendo en puerto ${PORT}`));
