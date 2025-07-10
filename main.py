import os
import asyncio
import tempfile
import shutil
from io import BytesIO
from pathlib import Path
from typing import Optional, List
import uuid

# Set environment variables for 3D processing
os.environ['ATTN_BACKEND'] = 'xformers'
os.environ['SPCONV_ALGO'] = 'native'
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"

import imageio
from PIL import Image
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Google AI imports
from google import genai
from google.genai import types

# Trellis imports for 3D generation
from trellis.pipelines import TrellisImageTo3DPipeline
from trellis.utils import render_utils, postprocessing_utils

# Initialize FastAPI app
app = FastAPI(
    title="3D Toy Generation API",
    description="Generate 3D toy figures from images and prompts",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables for models
genai_client = None
trellis_pipeline = None

# Configuration
UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("outputs")
TEMP_DIR = Path("temp")

# Create directories
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)

class ToyGenerationService:
    def __init__(self):
        self.genai_client = None
        self.trellis_pipeline = None
    
    async def initialize_models(self):
        """Initialize the AI models"""
        print("Initializing models...")
        
        # Initialize Google AI client
        self.genai_client = genai.Client()
        
        # Initialize Trellis pipeline
        print("Loading Trellis 3D pipeline...")
        self.trellis_pipeline = TrellisImageTo3DPipeline.from_pretrained(
            "JeffreyXiang/TRELLIS-image-large"
        )
        self.trellis_pipeline.cuda()
        print("Models initialized successfully!")
    
    def analyze_person_image(self, image_path: str) -> str:
        """Analyze person image to extract features"""
        try:
            person_img = Image.open(image_path)
            
            prompt = (
                "Describe the person in this image in detail. List their hair style and color, "
                "facial hair, any glasses, and the clothing they are wearing. Be factual and concise."
            )
            
            response = self.genai_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[prompt, person_img]
            )
            
            description = response.text.strip().replace('\n', ' ')
            return description
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error analyzing person image: {str(e)}")
    
    def analyze_toy_style(self, image_path: str) -> str:
        """Analyze toy style guide image"""
        try:
            toy_img = Image.open(image_path)
            
            prompt = (
                "Describe the general artistic style of this toy figure. Focus on its proportions "
                "(head vs body size), eye style, material (e.g., glossy vinyl, matte plastic), "
                "and overall aesthetic (e.g., chibi, cute, realistic). Do not describe the "
                "character itself, only the art style."
            )
            
            response = self.genai_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[prompt, toy_img]
            )
            
            description = response.text.strip().replace('\n', ' ')
            return description
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error analyzing toy style: {str(e)}")
    
    def generate_toy_image(self, user_prompt: str, content_desc: str, 
                          style_desc: str, person_image_path: str) -> str:
        """Generate enhanced toy image using Google AI"""
        try:
            person_image = Image.open(person_image_path)
            
            # Create enriched prompt
            final_prompt = (
                f"{user_prompt}. "
                f"The main character of the figure should be based on a person with these features: **({content_desc})**. "
                f"The overall artistic look and feel of the toy should match this style: **({style_desc})**."
            )
            
            print(f"Enriched prompt: {final_prompt}")
            
            response = self.genai_client.models.generate_content(
                model='gemini-2.0-flash-preview-image-generation',
                contents=[final_prompt, person_image],
                config=types.GenerateContentConfig(
                    response_modalities=['TEXT', 'IMAGE']
                )
            )
            
            # Save generated image
            image_found = False
            output_path = None
            
            for part in response.candidates[0].content.parts:
                if part.inline_data is not None:
                    generated_image = Image.open(BytesIO(part.inline_data.data))
                    
                    # Generate unique filename
                    unique_id = str(uuid.uuid4())
                    output_path = OUTPUT_DIR / f"generated_toy_{unique_id}.png"
                    generated_image.save(output_path)
                    
                    image_found = True
                    break
            
            if not image_found:
                raise HTTPException(status_code=500, detail="Model did not return an image")
            
            return str(output_path)
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error generating toy image: {str(e)}")
    
    def generate_3d_model(self, image_path: str, output_format: str = "gaussian") -> dict:
        """Generate 3D model from image using Trellis"""
        try:
            # Load the generated toy image
            image = Image.open(image_path)
            
            # Configure output formats
            formats = []
            if output_format == "all":
                formats = ["gaussian", "radiance_field", "mesh"]
            else:
                formats = [output_format]
            
            print(f"Generating 3D model with formats: {formats}")
            
            # Run the pipeline
            outputs = self.trellis_pipeline.run(
                image,
                seed=1,
                formats=formats,
                sparse_structure_sampler_params={
        "steps": 12,
        "cfg_strength": 7.5,
    },
    slat_sampler_params={
        "steps": 12,
        "cfg_strength": 3,
    },
            )
            
            # Generate unique ID for this generation
            unique_id = str(uuid.uuid4())
            result_files = {}
            
            # Process outputs based on requested format
            if "gaussian" in formats and outputs.get('gaussian'):
                # Save as PLY file
                ply_path = OUTPUT_DIR / f"model_{unique_id}.ply"
                outputs['gaussian'][0].save_ply(str(ply_path))
                result_files['ply'] = str(ply_path)
                
                # Render video
                video = render_utils.render_video(outputs['gaussian'][0])['color']
                video_path = OUTPUT_DIR / f"preview_{unique_id}.mp4"
                imageio.mimsave(str(video_path), video, fps=15)
                result_files['preview_video'] = str(video_path)
            
            if "mesh" in formats and outputs.get('mesh'):
                # Generate GLB file
                try:
                    glb = postprocessing_utils.to_glb(
                        outputs['gaussian'][0] if outputs.get('gaussian') else None,
                        outputs['mesh'][0],
                        simplify=0.95,
                        texture_size=1024,
                    )
                    glb_path = OUTPUT_DIR / f"model_{unique_id}.glb"
                    glb.export(str(glb_path))
                    result_files['glb'] = str(glb_path)
                except Exception as e:
                    print(f"Warning: Could not generate GLB: {e}")
            
            return {
                "success": True,
                "model_id": unique_id,
                "files": result_files,
                "formats": formats
            }
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error generating 3D model: {str(e)}")

# Initialize service
toy_service = ToyGenerationService()

@app.on_event("startup")
async def startup_event():
    """Initialize models on startup"""
    await toy_service.initialize_models()

@app.get("/")
async def root():
    return {"message": "3D Toy Generation API is running!"}

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "genai_client": toy_service.genai_client is not None,
        "trellis_pipeline": toy_service.trellis_pipeline is not None
    }

@app.post("/generate-toy")
async def generate_toy_endpoint(
    person_image: UploadFile = File(..., description="Image of the person"),
    style_guide: UploadFile = File(..., description="Toy style guide image"),
    prompt: str = Form(..., description="Base prompt for toy generation"),
    output_format: str = Form("gaussian", description="3D output format: gaussian, mesh, radiance_field, or all")
):
    """
    Complete pipeline: Analyze images, generate enhanced toy image, create 3D model
    """
    temp_files = []
    
    try:
        # Validate inputs
        if not person_image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="Person file must be an image")
        if not style_guide.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="Style guide file must be an image")
        
        # Save uploaded files temporarily
        person_temp_path = TEMP_DIR / f"person_{uuid.uuid4()}.png"
        style_temp_path = TEMP_DIR / f"style_{uuid.uuid4()}.png"
        temp_files.extend([person_temp_path, style_temp_path])
        
        # Save person image
        with open(person_temp_path, "wb") as f:
            content = await person_image.read()
            f.write(content)
        
        # Save style guide image
        with open(style_temp_path, "wb") as f:
            content = await style_guide.read()
            f.write(content)
        
        # Step 1: Analyze person image
        print("Analyzing person image...")
        person_description = toy_service.analyze_person_image(str(person_temp_path))
        
        # Step 2: Analyze toy style
        print("Analyzing toy style...")
        style_description = toy_service.analyze_toy_style(str(style_temp_path))
        
        # Step 3: Generate enhanced toy image
        print("Generating toy image...")
        toy_image_path = toy_service.generate_toy_image(
            prompt, person_description, style_description, str(person_temp_path)
        )
        
        # Step 4: Generate 3D model
        print("Generating 3D model...")
        model_result = toy_service.generate_3d_model(toy_image_path, output_format)
        
        return {
            "success": True,
            "message": "Toy generation completed successfully",
            "person_description": person_description,
            "style_description": style_description,
            "toy_image": toy_image_path,
            "model_result": model_result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")
    
    finally:
        # Clean up temporary files
        for temp_file in temp_files:
            try:
                if temp_file.exists():
                    temp_file.unlink()
            except:
                pass

@app.post("/generate-image-only")
async def generate_image_only(
    person_image: UploadFile = File(...),
    style_guide: UploadFile = File(...),
    prompt: str = Form(...)
):
    """Generate only the enhanced toy image without 3D conversion"""
    temp_files = []
    
    try:
        # Save uploaded files
        person_temp_path = TEMP_DIR / f"person_{uuid.uuid4()}.png"
        style_temp_path = TEMP_DIR / f"style_{uuid.uuid4()}.png"
        temp_files.extend([person_temp_path, style_temp_path])
        
        with open(person_temp_path, "wb") as f:
            f.write(await person_image.read())
        
        with open(style_temp_path, "wb") as f:
            f.write(await style_guide.read())
        
        # Analyze and generate
        person_desc = toy_service.analyze_person_image(str(person_temp_path))
        style_desc = toy_service.analyze_toy_style(str(style_temp_path))
        toy_image_path = toy_service.generate_toy_image(
            prompt, person_desc, style_desc, str(person_temp_path)
        )
        
        return {
            "success": True,
            "toy_image": toy_image_path,
            "person_description": person_desc,
            "style_description": style_desc
        }
        
    finally:
        for temp_file in temp_files:
            try:
                if temp_file.exists():
                    temp_file.unlink()
            except:
                pass

@app.post("/image-to-3d")
async def image_to_3d(
    image: UploadFile = File(...),
    output_format: str = Form("gaussian")
):
    """Convert an existing image to 3D model"""
    temp_path = None
    
    try:
        # Save uploaded image
        temp_path = TEMP_DIR / f"input_{uuid.uuid4()}.png"
        with open(temp_path, "wb") as f:
            f.write(await image.read())
        
        # Generate 3D model
        result = toy_service.generate_3d_model(str(temp_path), output_format)
        return result
        
    finally:
        if temp_path and temp_path.exists():
            try:
                temp_path.unlink()
            except:
                pass

@app.get("/download/{file_path:path}")
async def download_file(file_path: str):
    """Download generated files"""
    full_path = Path(file_path)
    
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        full_path,
        media_type='application/octet-stream',
        filename=full_path.name
    )

@app.delete("/cleanup")
async def cleanup_files():
    """Clean up old generated files"""
    try:
        # Remove files older than 1 hour
        import time
        current_time = time.time()
        count = 0
        
        for directory in [OUTPUT_DIR, TEMP_DIR]:
            for file_path in directory.glob("*"):
                if file_path.is_file():
                    file_age = current_time - file_path.stat().st_mtime
                    if file_age > 3600:  # 1 hour
                        file_path.unlink()
                        count += 1
        
        return {"message": f"Cleaned up {count} files"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(
        "main:app",  # Adjust if your file is named differently
        host="0.0.0.0",
        port=8000,
        reload=True
    )