import { useState, useRef, useCallback } from 'react';

export interface AudioRecorderOptions {
  onDataAvailable?: (blob: Blob) => void;
  onError?: (error: Error) => void;
  mimeType?: string;
}

export interface AudioRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number; // seconds
  audioBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;
}

export function useAudioRecorder(options: AudioRecorderOptions = {}) {
  const {
    onDataAvailable,
    onError,
    mimeType = 'audio/webm;codecs=opus' // Best cross-browser support
  } = options;

  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    isPaused: false,
    recordingTime: 0,
    audioBlob: null,
    audioUrl: null,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Request microphone permission and start recording
   */
  const startRecording = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null, audioBlob: null, audioUrl: null }));

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      streamRef.current = stream;

      // Determine best supported MIME type
      const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/mpeg'
      ];

      const supportedType = types.find(type => MediaRecorder.isTypeSupported(type)) || mimeType;

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: supportedType,
        audioBitsPerSecond: 128000 // 128 kbps for good quality
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // Handle data available
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Handle stop
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: supportedType });
        const url = URL.createObjectURL(blob);

        setState(prev => ({
          ...prev,
          isRecording: false,
          isPaused: false,
          audioBlob: blob,
          audioUrl: url
        }));

        // Clear timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        // Callback
        if (onDataAvailable) {
          onDataAvailable(blob);
        }

        // Clean up stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };

      // Handle errors
      mediaRecorder.onerror = (event: any) => {
        const error = new Error(event.error?.message || 'Recording error');
        setState(prev => ({ ...prev, error: error.message, isRecording: false }));
        if (onError) {
          onError(error);
        }
      };

      // Start recording
      mediaRecorder.start(100); // Capture data every 100ms

      // Start timer
      timerRef.current = setInterval(() => {
        setState(prev => ({ ...prev, recordingTime: prev.recordingTime + 1 }));
      }, 1000);

      setState(prev => ({ ...prev, isRecording: true, recordingTime: 0 }));

    } catch (error) {
      const err = error as Error;
      let errorMessage = 'Failed to start recording';

      if (err.name === 'NotAllowedError') {
        errorMessage = 'Microphone permission denied';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No microphone found';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setState(prev => ({ ...prev, error: errorMessage, isRecording: false }));
      if (onError) {
        onError(new Error(errorMessage));
      }
    }
  }, [mimeType, onDataAvailable, onError]);

  /**
   * Stop recording
   */
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();
    }
  }, [state.isRecording]);

  /**
   * Pause recording (if supported)
   */
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && !state.isPaused) {
      mediaRecorderRef.current.pause();
      setState(prev => ({ ...prev, isPaused: true }));

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [state.isRecording, state.isPaused]);

  /**
   * Resume recording
   */
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isPaused) {
      mediaRecorderRef.current.resume();
      setState(prev => ({ ...prev, isPaused: false }));

      // Restart timer
      timerRef.current = setInterval(() => {
        setState(prev => ({ ...prev, recordingTime: prev.recordingTime + 1 }));
      }, 1000);
    }
  }, [state.isPaused]);

  /**
   * Cancel recording and clean up
   */
  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      chunksRef.current = [];
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setState({
      isRecording: false,
      isPaused: false,
      recordingTime: 0,
      audioBlob: null,
      audioUrl: null,
      error: null
    });
  }, []);

  /**
   * Clear recorded audio
   */
  const clearRecording = useCallback(() => {
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
    }
    setState(prev => ({ ...prev, audioBlob: null, audioUrl: null }));
  }, [state.audioUrl]);

  /**
   * Check if MediaRecorder is supported
   */
  const isSupported = typeof window !== 'undefined' &&
                      'MediaRecorder' in window &&
                      'mediaDevices' in navigator;

  return {
    ...state,
    isSupported,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    clearRecording,
  };
}
