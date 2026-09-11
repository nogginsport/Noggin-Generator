const {Jimp, JimpMime, loadFont, measureText} = require('jimp');
const {SANS_128_BLACK} = require('jimp/fonts');
let fontPromise;
function validateWord(value) {
  const word = String(value || '').trim();
  if (word && !/^[A-Za-z0-9 &'!.-]{1,24}$/.test(word)) throw new Error('Use up to 24 English letters, numbers, spaces or basic punctuation.');
  return word;
}
async function wordImage(word, hex, width, height) {
  validateWord(word);
  if (!word) throw new Error('Custom word is empty');
  const font = await (fontPromise ||= loadFont(SANS_128_BLACK));
  const img = new Jimp({width:Math.max(1,measureText(font,word)),height:160,color:0x00000000});
  img.print({font,x:0,y:0,text:word});
  img.autocrop();
  const rgb = hex.replace('#','').match(/../g).map(v=>parseInt(v,16));
  for(let i=0;i<img.bitmap.data.length;i+=4) {img.bitmap.data[i]=rgb[0];img.bitmap.data[i+1]=rgb[1];img.bitmap.data[i+2]=rgb[2];}
  const scale=Math.min(width/img.width,height/img.height);
  img.resize({w:Math.max(1,Math.round(img.width*scale)),h:Math.max(1,Math.round(img.height*scale))});
  return img;
}
async function wordBuffer(word,hex,width,height) {
  const img=await wordImage(word,hex,width*.9,height*.85);
  const canvas=new Jimp({width,height,color:0x00000000});
  canvas.composite(img,Math.round((width-img.width)/2),Math.round((height-img.height)/2));
  return canvas.getBuffer(JimpMime.png);
}
module.exports={validateWord,wordImage,wordBuffer};
