import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Upload, User, Palette, Wand2, Download, Loader2, AlertCircle, 
  CheckCircle, FileImage, Box, Play, Sparkles, Zap, Star,
  ArrowRight, Camera, Layers, Settings, RefreshCw
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:8125';

const ToyGeneratorApp = () => {
  const [personImage, setPersonImage] = useState(null);
  const [styleGuide, setStyleGuide] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [outputFormat, setOutputFormat] = useState('gaussian');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImageOnly, setIsImageOnly] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [apiStatus, setApiStatus] = useState('checking');
  
  const personFileRef = useRef(null);
  const styleFileRef = useRef(null);

  const steps = [
    { text: 'Analyzing person image...', icon: User },
    { text: 'Analyzing toy style...', icon: Palette },
    { text: 'Generating enhanced toy image...', icon: Sparkles },
    { text: 'Creating 3D model...', icon: Box }
  ];

  const imageOnlySteps = [
    { text: 'Analyzing person image...', icon: User },
    { text: 'Analyzing toy style...', icon: Palette },
    { text: 'Generating enhanced toy image...', icon: Sparkles }
  ];

  // Check API health on component mount
  useEffect(() => {
    checkApiHealth();
  }, []);

  const checkApiHealth = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      if (response.ok) {
        setApiStatus('healthy');
      } else {
        setApiStatus('error');
      }
    } catch (error) {
      setApiStatus('error');
    }
  };

  const handleFileUpload = useCallback((file, setter) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setter({
          file,
          preview: e.target.result,
          name: file.name,
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB'
        });
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDrop = useCallback((e, setter) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0], setter);
    }
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const simulateProgress = useCallback((totalSteps) => {
    setCurrentStep(0);
    const interval = setInterval(() => {
      setCurrentStep(prev => {
        if (prev >= totalSteps - 1) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 2500);
    return interval;
  }, []);

  const generateToy = async () => {
    if (!personImage || !styleGuide || !prompt.trim()) {
      setError('Please upload both images and enter a prompt');
      return;
    }

    setIsGenerating(true);
    setError('');
    setResult(null);
    
    const currentSteps = isImageOnly ? imageOnlySteps : steps;
    const progressInterval = simulateProgress(currentSteps.length);

    try {
      const formData = new FormData();
      formData.append('person_image', personImage.file);
      formData.append('style_guide', styleGuide.file);
      formData.append('prompt', prompt);
      
      if (!isImageOnly) {
        formData.append('output_format', outputFormat);
      }

      const endpoint = isImageOnly ? '/generate-image-only' : '/generate-toy';
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Generation failed');
      }

      setResult(data);
      clearInterval(progressInterval);
      setCurrentStep(currentSteps.length);
      
    } catch (err) {
      setError(err.message);
      clearInterval(progressInterval);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadFile = (filePath) => {
    const encodedPath = encodeURIComponent(filePath);
    window.open(`${API_BASE_URL}/download/${encodedPath}`, '_blank');
  };

  const resetForm = () => {
    setPersonImage(null);
    setStyleGuide(null);
    setPrompt('');
    setResult(null);
    setError('');
    setCurrentStep(0);
  };

  const FileUploadArea = ({ file, onFileChange, onDrop, onDragOver, fileRef, icon: Icon, title, description, accent = "blue" }) => {
    const accentColors = {
      blue: "hover:border-blue-400 hover:bg-gradient-to-br hover:from-blue-50 hover:to-blue-100",
      purple: "hover:border-purple-400 hover:bg-gradient-to-br hover:from-purple-50 hover:to-purple-100",
      green: "hover:border-green-400 hover:bg-gradient-to-br hover:from-green-50 hover:to-green-100"
    };

    return (
      <div
        className={`upload-area group ${accentColors[accent]}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={(e) => onFileChange(e.target.files[0])}
          className="hidden"
        />
        
        {file ? (
          <div className="space-y-4">
            <div className="relative">
              <img 
                src={file.preview} 
                alt="Preview" 
                className="w-40 h-40 object-cover rounded-xl mx-auto shadow-lg ring-4 ring-white"
              />
              <div className="absolute -top-2 -right-2 bg-green-500 text-white rounded-full p-1">
                <CheckCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-gray-900">{file.name}</p>
              <p className="text-sm text-gray-500">{file.size}</p>
              <p className="text-xs text-gray-400">Click to change</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="relative">
              <Icon className="w-20 h-20 text-gray-400 mx-auto group-hover:text-gray-600 transition-colors" />
              <Upload className="w-8 h-8 text-gray-300 absolute -bottom-2 -right-2 group-hover:text-gray-500 transition-colors" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-gray-900">{title}</h3>
              <p className="text-gray-600">{description}</p>
              <div className="text-sm text-gray-400 space-y-1">
                <p>Drag & drop or click to upload</p>
                <p className="text-xs">Supports: JPG, PNG, WEBP</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const ProgressBar = () => {
    const currentSteps = isImageOnly ? imageOnlySteps : steps;
    const progress = isGenerating ? (currentStep / currentSteps.length) * 100 : 0;
    
    return (
      <div className="card p-8 space-y-8">
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 animate-spin"></div>
            <div className="absolute inset-2 rounded-full bg-white flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gradient">Generating Your 3D Toy</h3>
            <p className="text-gray-600 mt-2">This might take a few minutes...</p>
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="relative">
            <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
              <div 
                className="progress-bar"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-semibold text-white drop-shadow-sm">
                {Math.round(progress)}%
              </span>
            </div>
          </div>
          
          <div className="grid gap-4">
            {currentSteps.map((step, index) => {
              const StepIcon = step.icon;
              const isCompleted = index < currentStep;
              const isCurrent = index === currentStep;
              const isPending = index > currentStep;
              
              return (
                <div key={index} className={`flex items-center space-x-4 p-4 rounded-lg transition-all ${
                  isCompleted ? 'bg-green-50 text-green-700' : 
                  isCurrent ? 'bg-blue-50 text-blue-700 shadow-md' : 
                  'bg-gray-50 text-gray-400'
                }`}>
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                    isCompleted ? 'bg-green-100' : 
                    isCurrent ? 'bg-blue-100' : 
                    'bg-gray-100'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : isCurrent ? (
                      <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                    ) : (
                      <StepIcon className="w-5 h-5" />
                    )}
                  </div>
                  <span className="font-medium flex-1">{step.text}</span>
                  {isCompleted && <Star className="w-4 h-4 text-yellow-500" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const ApiStatusBadge = () => (
    <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium ${
      apiStatus === 'healthy' ? 'bg-green-100 text-green-800' :
      apiStatus === 'error' ? 'bg-red-100 text-red-800' :
      'bg-yellow-100 text-yellow-800'
    }`}>
      <div className={`w-2 h-2 rounded-full ${
        apiStatus === 'healthy' ? 'bg-green-500' :
        apiStatus === 'error' ? 'bg-red-500' :
        'bg-yellow-500 animate-pulse'
      }`} />
      <span>
        {apiStatus === 'healthy' ? 'API Connected' :
         apiStatus === 'error' ? 'API Offline' :
         'Checking API...'}
      </span>
    </div>
  );

  const ResultDisplay = () => {
    if (!result) return null;

    return (
      <div className="card p-8 space-y-8">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <div>
            <h3 className="text-3xl font-bold text-gradient">Generation Complete!</h3>
            <p className="text-gray-600">Your 3D toy has been successfully created</p>
          </div>
        </div>

        {/* Analysis Results */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
            <div className="flex items-center space-x-2 mb-3">
              <User className="w-5 h-5 text-blue-600" />
              <h4 className="font-bold text-blue-900">Person Analysis</h4>
            </div>
            <p className="text-blue-800 text-sm leading-relaxed">{result.person_description}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
            <div className="flex items-center space-x-2 mb-3">
              <Palette className="w-5 h-5 text-purple-600" />
              <h4 className="font-bold text-purple-900">Style Analysis</h4>
            </div>
            <p className="text-purple-800 text-sm leading-relaxed">{result.style_description}</p>
          </div>
        </div>

        {/* Generated Image */}
        <div className="space-y-6">
          <div className="text-center">
            <h4 className="text-2xl font-bold flex items-center justify-center space-x-3">
              <FileImage className="w-7 h-7 text-blue-600" />
              <span>Generated Toy Image</span>
            </h4>
          </div>
          
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-8 text-center">
            <img 
              src={`${API_BASE_URL}/download/${encodeURIComponent(result.toy_image)}`}
              alt="Generated toy"
              className="max-w-lg mx-auto rounded-xl shadow-xl ring-4 ring-white"
            />
          </div>
          
          <div className="flex justify-center">
            <button
              onClick={() => downloadFile(result.toy_image)}
              className="btn-primary flex items-center space-x-2"
            >
              <Download className="w-5 h-5" />
              <span>Download Image</span>
            </button>
          </div>
        </div>

        {/* 3D Model Files */}
        {result.model_result && (
          <div className="space-y-6">
            <div className="text-center">
              <h4 className="text-2xl font-bold flex items-center justify-center space-x-3">
                <Box className="w-7 h-7 text-purple-600" />
                <span>3D Model Files</span>
              </h4>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              {result.model_result.files.ply && (
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200 text-center space-y-4">
                  <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center mx-auto">
                    <Box className="w-6 h-6 text-green-700" />
                  </div>
                  <div>
                    <h5 className="font-bold text-green-900">3D Model (PLY)</h5>
                    <p className="text-sm text-green-700">Point cloud format</p>
                  </div>
                  <button
                    onClick={() => downloadFile(result.model_result.files.ply)}
                    className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
                  >
                    Download PLY
                  </button>
                </div>
              )}
              
              {result.model_result.files.glb && (
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200 text-center space-y-4">
                  <div className="w-12 h-12 bg-blue-200 rounded-full flex items-center justify-center mx-auto">
                    <Layers className="w-6 h-6 text-blue-700" />
                  </div>
                  <div>
                    <h5 className="font-bold text-blue-900">3D Model (GLB)</h5>
                    <p className="text-sm text-blue-700">Universal 3D format</p>
                  </div>
                  <button
                    onClick={() => downloadFile(result.model_result.files.glb)}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                  >
                    Download GLB
                  </button>
                </div>
              )}
              
              {result.model_result.files.preview_video && (
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200 text-center space-y-4">
                  <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center mx-auto">
                    <Play className="w-6 h-6 text-purple-700" />
                  </div>
                  <div>
                    <h5 className="font-bold text-purple-900">Preview Video</h5>
                    <p className="text-sm text-purple-700">360° rotation view</p>
                  </div>
                  <button
                    onClick={() => downloadFile(result.model_result.files.preview_video)}
                    className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
                  >
                    Download Video
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Reset Button */}
        <div className="text-center pt-6 border-t border-gray-200">
          <button
            onClick={resetForm}
            className="btn-secondary flex items-center space-x-2 mx-auto"
          >
            <RefreshCw className="w-5 h-5" />
            <span>Create Another Toy</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-primary">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-center space-x-4">
              <div className="relative">
                <Box className="w-16 h-16 text-blue-600 float-animation" />
                <Sparkles className="w-6 h-6 text-yellow-500 absolute -top-2 -right-2" />
              </div>
              <h1 className="text-5xl font-bold text-gradient">
                3D Toy Generator
              </h1>
            </div>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Transform any person into a custom 3D toy figure with AI-powered generation. 
              Upload a photo, choose a style, and watch the magic happen!
            </p>
          </div>
          
          <div className="flex items-center justify-center space-x-4">
            <ApiStatusBadge />
            <button
              onClick={checkApiHealth}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              title="Refresh API status"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Upload Section */}
          <div className="card p-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4 flex items-center justify-center space-x-3">
                <Upload className="w-8 h-8 text-blue-600" />
                <span>Upload Images</span>
              </h2>
              <p className="text-gray-600">Start by uploading a person's photo and a style reference</p>
            </div>
            
            <div className="grid lg:grid-cols-2 gap-8 mb-8">
              <FileUploadArea
                file={personImage}
                onFileChange={(file) => handleFileUpload(file, setPersonImage)}
                onDrop={(e) => handleDrop(e, setPersonImage)}
                onDragOver={handleDragOver}
                fileRef={personFileRef}
                icon={User}
                title="Person Image"
                description="Upload a clear photo of the person to transform"
                accent="blue"
              />
              
              <FileUploadArea
                file={styleGuide}
                onFileChange={(file) => handleFileUpload(file, setStyleGuide)}
                onDrop={(e) => handleDrop(e, setStyleGuide)}
                onDragOver={handleDragOver}
                fileRef={styleFileRef}
                icon={Palette}
                title="Style Guide"
                description="Upload a toy figure to match the artistic style"
                accent="purple"
              />
            </div>

            {/* Prompt Input */}
            <div className="space-y-4 mb-8">
              <div className="flex items-center space-x-3">
                <Wand2 className="w-6 h-6 text-purple-600" />
                <label className="text-xl font-bold text-gray-900">
                  Toy Description
                </label>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the toy you want to create... (e.g., 'A cute chibi-style action figure with a superhero costume and cape, standing in a heroic pose')"
                className="input-field resize-none h-32"
              />
              <p className="text-sm text-gray-500">
                Be specific! Mention the pose, clothing, accessories, and overall style you want.
              </p>
            </div>

            {/* Options */}
            <div className="grid lg:grid-cols-2 gap-8 mb-8">
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Settings className="w-5 h-5 text-gray-600" />
                  <label className="text-lg font-bold text-gray-900">Generation Mode</label>
                </div>
                <div className="space-y-3">
                  <label className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      checked={!isImageOnly}
                      onChange={() => setIsImageOnly(false)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div className="flex-1">
                      <span className="font-medium">Full 3D Generation</span>
                      <p className="text-sm text-gray-500">Generate both image and 3D model (slower)</p>
                    </div>
                    <Zap className="w-5 h-5 text-blue-500" />
                  </label>
                  <label className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      checked={isImageOnly}
                      onChange={() => setIsImageOnly(true)}
                      className="w-4 h-4 text-green-600"
                    />
                    <div className="flex-1">
                      <span className="font-medium">Image Only</span>
                      <p className="text-sm text-gray-500">Generate only the toy image (faster)</p>
                    </div>
                    <Camera className="w-5 h-5 text-green-500" />
                  </label>
                </div>
              </div>

              {!isImageOnly && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <Box className="w-5 h-5 text-gray-600" />
                    <label className="text-lg font-bold text-gray-900">3D Output Format</label>
                  </div>
                  <select
                    value={outputFormat}
                    onChange={(e) => setOutputFormat(e.target.value)}
                    className="input-field"
                  >
                    <option value="gaussian">Gaussian Splatting (Recommended)</option>
                    <option value="mesh">Mesh (Universal)</option>
                    <option value="radiance_field">Radiance Field (Advanced)</option>
                    <option value="all">All Formats (Takes longer)</option>
                  </select>
                  <p className="text-sm text-gray-500">
                    Gaussian format provides the best quality for 3D viewing and editing.
                  </p>
                </div>
              )}
            </div>

            {/* Generate Button */}
            <div className="text-center">
              <button
                onClick={generateToy}
                disabled={isGenerating || !personImage || !styleGuide || !prompt.trim() || apiStatus === 'error'}
                className="btn-primary text-xl py-4 px-12 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center space-x-3 mx-auto"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-6 h-6" />
                    <span>Generate 3D Toy</span>
                    <ArrowRight className="w-6 h-6" />
                  </>
                )}
              </button>
              
              {apiStatus === 'error' && (
                <p className="text-red-600 text-sm mt-2">
                  API is offline. Please check your backend connection.
                </p>
              )}
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
              <div className="flex items-center space-x-3">
                <AlertCircle className="w-6 h-6 text-red-600" />
                <h3 className="text-lg font-semibold text-red-900">Something went wrong</h3>
              </div>
              <p className="text-red-800 mt-2">{error}</p>
            </div>
          )}

          {/* Progress Display */}
          {isGenerating && <ProgressBar />}

          {/* Results Display */}
          <ResultDisplay />
        </div>
      </div>
    </div>
  );
};

export default ToyGeneratorApp;