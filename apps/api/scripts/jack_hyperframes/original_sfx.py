"""Original synthesized accents, no third-party samples."""
import math,random,wave,struct
def generate(folder):
    folder.mkdir(parents=True,exist_ok=True)
    result={}
    for name,length in (("soft_impact",.24),("digital_ping",.18),("short_whoosh",.35),("comic_pop",.16)):
        rng=random.Random(42)
        path=folder/(name+".wav")
        samples=[]
        for i in range(round(length*48000)):
            t=i/48000;u=t/length
            env=min(1,t/.008)*(1-u)**2
            if name=="short_whoosh": x=(rng.random()*2-1)*math.sin(math.pi*u)
            elif name=="soft_impact": x=math.sin(2*math.pi*(95*t-90*t*t))
            elif name=="comic_pop": x=math.sin(2*math.pi*(280*t+1200*t*t))
            else: x=math.sin(2*math.pi*880*t)+.25*math.sin(2*math.pi*1320*t)
            samples.append(int(14000*env*x))
        with wave.open(str(path),"wb") as w:
            w.setparams((1,2,48000,0,"NONE","not compressed"))
            w.writeframes(struct.pack("<"+"h"*len(samples),*samples))
        result[name]={"path":path,"kind":"sfx","source":"original procedural synthesis"}
    return result
