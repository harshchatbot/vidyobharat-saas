"""Optional independent still-frame review, no automatic approval."""
import base64,json,subprocess
def review(video,out,frames):
    from openai import OpenAI
    images=[]
    for i in range(8):
        t=(i+.5)*frames/30/8
        p=out/("critic_%02d.jpg"%i)
        subprocess.run(["ffmpeg","-v","error","-ss",str(t),"-i",str(video),"-frames:v","1","-vf","scale=540:-1",str(p)],check=True)
        images.append({"type":"image_url","image_url":{"url":"data:image/jpeg;base64,"+base64.b64encode(p.read_bytes()).decode()}})
    response=OpenAI().chat.completions.create(model="gpt-4.1-mini",response_format={"type":"json_object"},messages=[{"role":"user","content":[{"type":"text","text":"Independently critique these ordered sampled video frames. Return JSON with findings, specific frame indices, composition, readability, visual relevance concerns and actionable revisions. Do not infer motion or audio quality. No publication approval."}]+images}])
    result=json.loads(response.choices[0].message.content)
    (out/"motion_critic.json").write_text(json.dumps({"scope":"sampled still frames only","human_review_required":True,"review":result},indent=2))
