# Guía rápida para colaboradores

## Requisitos

- Git instalado.
- Node.js y npm para tareas de despliegue.
- Acceso a las variables de entorno de desarrollo; nunca se comparten secretos por Git.

## Flujo de trabajo

1. Clonar el repositorio y entrar a la carpeta del proyecto.
2. Crear una rama descriptiva desde `main`.
3. Realizar un cambio pequeño y probarlo localmente.
4. Registrar el cambio con un commit claro.
5. Subir la rama y abrir una comparación antes de fusionar.
6. Fusionar en `main` después de revisar los cambios.

Ejemplo:

```powershell
git clone https://github.com/Keenstylee/Festholic.git
cd Festholic
git switch -c feature/nombre-del-cambio
git add .
git commit -m "Describir el cambio realizado"
git push -u origin feature/nombre-del-cambio
```

## Ejecución local

```powershell
python -m http.server 5178 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:5178` en el navegador.

## Reglas básicas

- No subir `.dev.vars`, contraseñas, tokens ni claves de API.
- Mantener los cambios enfocados en una sola tarea.
- Describir en el commit qué se modificó y por qué.
- Probar los flujos afectados antes de fusionar.
