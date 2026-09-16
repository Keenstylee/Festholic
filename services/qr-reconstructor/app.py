from __future__ import annotations

import cv2
import numpy as np
import streamlit as st

from src.pipeline import process_image
from src.reconstruction import encode_png


st.set_page_config(page_title="Digitalizador QR", page_icon="▦", layout="wide")
st.title("Sistema inteligente de digitalización de códigos QR")
st.caption("Detecta, rectifica, reconstruye y valida códigos QR fotografiados.")

uploaded = st.file_uploader("Carga una imagen JPG, PNG o BMP", type=["jpg", "jpeg", "png", "bmp"])

if uploaded is None:
    st.info("Carga una fotografía para iniciar el procesamiento.")
    st.stop()

raw = np.frombuffer(uploaded.getvalue(), dtype=np.uint8)
image = cv2.imdecode(raw, cv2.IMREAD_COLOR)

if image is None:
    st.error("El archivo no pudo interpretarse como una imagen válida.")
    st.stop()

with st.spinner("Analizando la imagen y reconstruyendo la cuadrícula…"):
    result = process_image(image)

left, right = st.columns(2)
with left:
    st.subheader("Imagen original")
    st.image(cv2.cvtColor(image, cv2.COLOR_BGR2RGB), use_container_width=True)

if not result.success:
    st.error(result.message)
    st.stop()

with right:
    st.subheader("QR digitalizado")
    st.image(result.clean, clamp=True, use_container_width=True)

if result.validated:
    st.success(result.message)
else:
    st.warning(result.message)

col1, col2, col3 = st.columns(3)
col1.metric("Método seleccionado", result.method)
col2.metric("Dimensión estimada", f"{result.matrix.shape[0]} × {result.matrix.shape[1]} módulos")
col3.metric("Validación", "Aprobada" if result.validated else "No aprobada")

with st.expander("Detalles técnicos"):
    st.write("Contenido detectado en la entrada:", result.decoded_text or "No decodificado")
    st.write("Contenido leído desde la salida:", result.validation_text or "No decodificado")
    st.image(result.straight, caption="Vista rectificada detectada", clamp=True)

st.download_button(
    "Descargar QR_Digitalizado.png",
    data=encode_png(result.clean),
    file_name="QR_Digitalizado.png",
    mime="image/png",
    disabled=not result.validated,
    help="La descarga se habilita cuando la reconstrucción supera la validación.",
)

