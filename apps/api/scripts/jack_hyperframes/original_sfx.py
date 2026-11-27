"""Original synthesized accents, no third-party samples."""
import math,random,wave,struct
def generate(folder):
    folder.mkdir(parents=True,exist_ok=True)
    result={}
    for name,length in (("soft_impact",.24),("digital_ping",.18),("short_whoosh",.35),("comic_pop",.16),("glitch_tick",.20),("deep_hit",.45),("riser",.65),("interface_click",.07),("paper_swipe",.28),("comic_drop",.32),("shutter",.12),("sparkle",.38)):
        rng=random.Random(42)
        path=folder/(name+".wav")
        samples=[]
        for i in range(round(length*48000)):
            t=i/48000;u=t/length
            env=min(1,t/.008)*(1-u)**2
            if name=="short_whoosh": x=(rng.random()*2-1)*math.sin(math.pi*u)
            elif name=="soft_impact": x=math.sin(2*math.pi*(95*t-90*t*t))
            elif name=="comic_pop": x=math.sin(2*math.pi*(280*t+1200*t*t))
            elif name=="glitch_tick": x=(rng.random()*2-1)*(int(t*90)%2)
            elif name=="deep_hit": x=math.sin(2*math.pi*(65*t-30*t*t))
            elif name=="riser": x=math.sin(2*math.pi*(180*t+650*t*t));env=math.sin(math.pi*u)**2
            elif name=="interface_click": x=math.sin(2*math.pi*2200*t)
            elif name=="paper_swipe": x=(rng.random()*2-1)*math.sin(math.pi*u)**2
            elif name=="comic_drop": x=math.sin(2*math.pi*(650*t-700*t*t))
            elif name=="shutter": x=(rng.random()*2-1)*(1 if int(t*65)%3==0 else .1)
            elif name=="sparkle": x=.6*math.sin(2*math.pi*1320*t)+.3*math.sin(2*math.pi*1980*t)
            else: x=math.sin(2*math.pi*880*t)+.25*math.sin(2*math.pi*1320*t)
            samples.append(int(14000*env*x))
        with wave.open(str(path),"wb") as w:
            w.setparams((1,2,48000,0,"NONE","not compressed"))
            w.writeframes(struct.pack("<"+"h"*len(samples),*samples))
        result[name]={"path":path,"kind":"sfx","source":"original procedural synthesis"}
    return result
