import { useUploadedSprites } from './mascot.js';
const form = document.querySelector('#upload-form');
const message = document.querySelector('#upload-status');
const submit = document.querySelector('#upload-submit');
let activeURLs = [];
async function check(file, url, label) {
  if (!file || !['image/png', 'image/webp'].includes(file.type)) throw new Error(`${label}请选择 PNG 或 WebP`);
  if (file.size > 15 * 1024 * 1024) throw new Error(`${label}超过 15 MB，请先压缩`);
  const image = new Image(); image.src = url; await image.decode();
  const n = image.naturalWidth;
  if (n !== image.naturalHeight || n < 300 || n > 4096) throw new Error(`${label}应为 300–4096 像素的正方形图片`);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 128, 128);
  const data = ctx.getImageData(0, 0, 128, 128).data;
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 128) transparent++;
  if (transparent < 128 * 128 * .03) throw new Error(`${label}未检测到足够透明背景，请先抠图；不会自动删除角色的白色部分`);
}
form.addEventListener('submit', async event => {
  event.preventDefault(); submit.disabled = true; message.textContent = '正在检查图片与对齐角色…';
  const files = [document.querySelector('#upload-directions').files[0], document.querySelector('#upload-reactions').files[0]];
  let urls = [];
  try {
    if (files.some(file => !file)) throw new Error('请先选择两张素材');
    urls = files.map(file => URL.createObjectURL(file));
    await Promise.all(files.map((file, i) => check(file, urls[i], i ? '表情图' : '方向图')));
    await useUploadedSprites(...urls);
    activeURLs.forEach(url => URL.revokeObjectURL(url)); activeURLs = urls; urls = [];
    message.textContent = '已载入你的角色！移动鼠标或点击角色试玩。';
    document.querySelector('.playground').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) { message.textContent = `未替换素材：${error.message}`; }
  finally { urls.forEach(url => URL.revokeObjectURL(url)); submit.disabled = false; }
});
