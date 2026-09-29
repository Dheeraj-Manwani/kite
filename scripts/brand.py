"""Deterministic vector-derived brand art. Requires Pillow; no AI or reference art."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets';OUT.mkdir(exist_ok=True)
TEAL='#147d80';NAVY='#173e49';GOLD='#e9a43f';PAPER='#f5f8f2'
def font(size,bold=False):
    file=Path('C:/Windows/Fonts')/('segoeuib.ttf' if bold else 'segoeui.ttf')
    return ImageFont.truetype(str(file),size) if file.exists() else ImageFont.load_default(size=size)
def kite(draw,x,y,s=1,phase=0,outline=NAVY):
    def p(a,b):return (x+a*s,y+b*s)
    w=max(1,round(2*s))
    draw.polygon([p(0,-42),p(36,-6),p(0,44),p(-36,-6)],fill=TEAL,outline=outline,width=w)
    draw.polygon([p(0,-42),p(36,-6),p(0,-6)],fill=GOLD)
    draw.line([p(0,-40),p(0,42)],fill='#fff2ce',width=max(1,round(s)))
    draw.line([p(-34,-6),p(34,-6)],fill='#fff2ce',width=max(1,round(s)))
    tail=[p(math.sin(i/12+phase)*5,44+i) for i in range(42)]
    draw.line(tail,fill=outline,width=w)
    for yy in [57,76]:
        xx=math.sin((yy-44)/12+phase)*5
        draw.polygon([p(xx-12,yy-6),p(xx+12,yy+6),p(xx+12,yy-6),p(xx-12,yy+6)],fill=GOLD)
def icon(size,transparent=False):
    im=Image.new('RGBA',(size,size),(0,0,0,0) if transparent else PAPER)
    d=ImageDraw.Draw(im);kite(d,size/2,size*.37,size/145)
    return im
for size in [256,512]:icon(size).save(OUT/f'kite-{size}.png')
icon(512).save(OUT/'kite.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
for theme,outline in [('light',NAVY),('dark','#f7efda')]:
    im=Image.new('RGBA',(128,128));kite(ImageDraw.Draw(im),64,45,.83,outline=outline);im.resize((32,32),Image.Resampling.LANCZOS).save(OUT/f'tray-{theme}.png')
im=icon(128,True);ImageDraw.Draw(im).ellipse((85,8,121,44),fill=GOLD,outline=NAVY,width=4);im.resize((32,32),Image.Resampling.LANCZOS).save(OUT/'tray-update.png')
im=Image.new('RGB',(1280,640),PAPER);d=ImageDraw.Draw(im)
d.rounded_rectangle((70,65,1210,575),radius=40,fill='#e4efea')
kite(d,970,240,2.7);d.text((125,140),'Kite',font=font(100,True),fill=NAVY)
d.text((130,280),'A little company beside your cursor.',font=font(32),fill=NAVY)
d.text((130,345),'Hold. Ask. Circle anything.',font=font(40,True),fill=TEAL)
d.text((130,485),'Windows  /  BYOK  /  Your keys. Your computer.',font=font(22),fill=NAVY)
im.save(OUT/'social-preview.png');im.save(OUT/'readme-hero.png')
def animation(name,title,subtitle,seconds=4,installer=False):
    frames=[];width,height=(440,260) if installer else (900,480)
    for i in range(seconds*10):
        t=i/10;im=Image.new('RGB',(width,height),PAPER);d=ImageDraw.Draw(im)
        if installer:
            kite(d,220,88,1.1,phase=t*3);d.text((130,205),'Kite is landing…',font=font(23,True),fill=NAVY)
        else:
            d.text((40,30),title,font=font(28,True),fill=NAVY)
            d.rounded_rectangle((40,105,600,380),radius=20,fill='white',outline='#d2e3dc',width=2)
            d.text((70,145),subtitle,font=font(24),fill=NAVY)
            x=650+45*math.sin(t*1.3);y=210+35*math.sin(t*1.7)
            kite(d,x,y,1.2,phase=t*4)
            if 'circle' in name or name=='hero':
                d.text((85,225),'Revenue grew 24% this quarter.',font=font(24),fill=NAVY)
                if t>1:d.arc((68,195,570,290),0,min(359,int((t-1)*180)),fill=GOLD,width=4)
                if t>3:d.rounded_rectangle((350,310,825,375),radius=16,fill=TEAL);d.text((370,325),'Kite: Growth is up this quarter.',font=font(20),fill='white')
            d.text((40,430),'Interface illustration • simulated sequence',font=font(17),fill='#617774')
        frames.append(im)
    frames[0].save(OUT/(name+'.gif'),save_all=True,append_images=frames[1:],duration=100,loop=0,optimize=True)
animation('installer','','',3,True)
animation('hero','Meet Kite','Hold Ctrl + Win. Ask about what you see.',7)
for name,title,sub in [('voice','Talk while you hold','Release to hear the answer.'),('providers','Choose your model','OpenAI · Anthropic · Gemini · Groq · Kimi'),('actions','Actions with a clear yes','Open Spotify?    [Approve]    [Decline]'),('circle','Circle to ask','Mark it. Ask about “this”.'),('reminders','A nudge when it matters','Remind me to stretch in 20 minutes.')]:animation(name,title,sub)
# Editable source shared with the app's diamond / cross-spar / bow-tail identity.
(OUT/'kite.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-48 -52 96 148"><path d="M0-42 36-6 0 44-36-6Z" fill="#147d80" stroke="#173e49" stroke-width="2"/><path d="M0-42 36-6H0Z" fill="#e9a43f"/><path d="M0-42V44M-36-6H36M0 44Q-12 64 0 84" fill="none" stroke="#fff2ce" stroke-width="1.5"/><path d="M-12 52 12 64V52L-12 64ZM-12 72 12 84V72L-12 84Z" fill="#e9a43f"/></svg>')
print('Generated brand assets and explicitly labeled UI illustrations.')
