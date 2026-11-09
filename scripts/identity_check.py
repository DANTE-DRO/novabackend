"""Local OCR + YuNet/SFace comparison. No network/API calls; NOT document-authenticity or liveness certification."""
import sys, json, base64, re, os, unicodedata, subprocess
from pathlib import Path
import cv2
import numpy as np

ROOT=Path(__file__).resolve().parent.parent
MODELS=ROOT/'models'

def image(data):
    raw=base64.b64decode(data.split(',',1)[1],validate=True)
    img=cv2.imdecode(np.frombuffer(raw,dtype=np.uint8),cv2.IMREAD_COLOR)
    if img is None or min(img.shape[:2])<160 or max(img.shape[:2])>4096:
        raise ValueError('Capture a clear image between 160 and 4096 pixels.')
    return img

def normalize(text):
    return ' '.join(re.findall(r'\w+',unicodedata.normalize('NFKD',text).encode('ascii','ignore').decode().lower()))

def face(img,detector):
    h,w=img.shape[:2]
    detector.setInputSize((w,h))
    _,faces=detector.detect(img)
    if faces is None or len(faces)!=1:
        return None
    return faces[0]

def ocr(img):
    ok,buf=cv2.imencode('.png',img)
    if not ok: return ''
    proc=subprocess.run(['tesseract','stdin','stdout','-l','eng','--psm','11'],input=buf.tobytes(),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=15,check=True)
    return proc.stdout.decode('utf-8','replace')

def main():
    cv2.setNumThreads(1)
    b=json.load(sys.stdin)
    doc=image(b['document']); selfie=image(b['selfie'])
    detector=cv2.FaceDetectorYN.create(str(MODELS/'yunet.onnx'),'',(320,320),0.85,0.3,5000)
    recognizer=cv2.FaceRecognizerSF.create(str(MODELS/'sface.onnx'),'')
    df=face(doc,detector); sf=face(selfie,detector)
    similarity=None
    if df is not None and sf is not None:
        f1=recognizer.feature(recognizer.alignCrop(doc,df))
        f2=recognizer.feature(recognizer.alignCrop(selfie,sf))
        similarity=float(recognizer.match(f1,f2,cv2.FaceRecognizerSF_FR_COSINE))
    if b.get('faceOnly'):
        print(json.dumps({'faceMatch':similarity is not None and similarity>=float(os.environ.get('FACE_MATCH_THRESHOLD','0.45')),'similarity':similarity,'live':False})); return
    text=ocr(doc)
    if b.get('documentBack'): text+='\n'+ocr(image(b['documentBack']))
    normalized=normalize(text)
    name_parts=[x for x in normalize(b.get('name','')).split() if len(x)>1]
    name_match=bool(name_parts) and all(x in normalized.split() for x in name_parts)
    dob=b.get('dob','')
    formats=[]
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}',dob):
        y,m,d=dob.split('-'); formats=[y+m+d,d+m+y,m+d+y,d+m+y[-2:]]
    digits=re.sub(r'\D','',text)
    dob_match=any(x in digits for x in formats)
    threshold=float(os.environ.get('FACE_MATCH_THRESHOLD','0.45'))
    print(json.dumps({'faceDetected':bool(df is not None and sf is not None),'faceMatch':similarity is not None and similarity>=threshold,'similarity':similarity,'threshold':threshold,'nameMatch':name_match,'dobMatch':dob_match,'ocrAvailable':bool(text.strip()),'live':False,'documentAuthentic':None,'requiresHumanReview':True,'note':'Local similarity and English OCR are screening signals only. Inspect name, birth date, document and live-person evidence manually. Non-Latin documents may require a fluent reviewer.'}))

if __name__=='__main__':
    try: main()
    except ValueError as e: print(json.dumps({'error':str(e),'requiresHumanReview':True}))
