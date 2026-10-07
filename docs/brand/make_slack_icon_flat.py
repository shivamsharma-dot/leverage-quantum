# Flat, bold, big-brand style: pure white tile, solid brand-colour bars, no gradients/shadows/glow.
from PIL import Image, ImageDraw, ImageFont
S, OUT = 4096, 1024
def hexc(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
BARS=[(3,10.5,4,9,'#4CAE6F'),(9,5.5,4,14,'#1C9FD4'),(15,2.5,4,17,'#1F3C84')]
LOCK=Image.open('../../public/leverage-edu-lockup.png').convert('RGBA')
MARK=LOCK.crop((0,0,520,LOCK.height)); MARK.paste(Image.new('RGBA',(250,180),(0,0,0,0)),(270,0)); MARK=MARK.crop(MARK.getbbox())
def build(scale, cx, cy, badge=False):
    im=Image.new('RGB',(S,S),(255,255,255)); d=ImageDraw.Draw(im)
    u=S*scale/16.0; ox=S*cx-8*u-3*u; oy=S*cy-8.5*u-2.5*u
    for x,y,w,h,c in BARS:
        d.rounded_rectangle((ox+x*u,oy+y*u,ox+(x+w)*u,oy+(y+h)*u),radius=1.5*u,fill=hexc(c))
    if badge:
        D=int(S*.27); bx=by=int(S*.77)
        d.ellipse((bx-D//2-int(S*.008),by-D//2-int(S*.008),bx+D//2+int(S*.008),by+D//2+int(S*.008)),fill=hexc('#DDE3EE'))
        d.ellipse((bx-D//2,by-D//2,bx+D//2,by+D//2),fill=(255,255,255))
        sc=int(D*.64)/max(MARK.size); mk=MARK.resize((int(MARK.width*sc),int(MARK.height*sc)),Image.LANCZOS)
        im.paste(mk,(bx-mk.width//2,by-mk.height//2),mk)
    return im.resize((OUT,OUT),Image.LANCZOS)
a=build(.60,.50,.50); a.save('flat-a-bars-1024.png'); a.resize((512,512),Image.LANCZOS).save('flat-a-bars-512.png')
b=build(.50,.455,.465,badge=True); b.save('flat-b-bars-badge-1024.png'); b.resize((512,512),Image.LANCZOS).save('flat-b-bars-badge-512.png')
f=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',22)
pv=Image.new('RGB',(1000,420),(247,247,247)); dr=ImageDraw.Draw(pv)
def tile(im,x,y,sz):
    r=Image.new('L',(sz,sz),0); ImageDraw.Draw(r).rounded_rectangle((0,0,sz-1,sz-1),radius=int(sz*.225),fill=255)
    t=im.resize((sz,sz),Image.LANCZOS); pv.paste(t,(x,y),r)
    ImageDraw.Draw(pv).rounded_rectangle((x,y,x+sz-1,y+sz-1),radius=int(sz*.225),outline=(225,228,235),width=1)
for i,(n,im) in enumerate([('A  bars only',a),('B  bars + Leverage badge',b)]):
    x=40+i*480; tile(im,x,30,260); dr.text((x,305),n,fill=(30,40,70),font=f)
    tile(im,x+290,60,72); tile(im,x+290,160,48); tile(im,x+290,230,32)
pv.save('flat-compare.png')
