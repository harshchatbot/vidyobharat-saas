export type Project = {
  id: string;
  user_id: string;
  title: string;
  script: string;
  language: string;
  voice: string;
  template: string;
  created_at: string;
};

export type Render = {
  id: string;
  project_id: string;
  user_id: string;
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  progress: number;
  video_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectDetail = {
  project: Project;
  renders: Render[];
};

export type Avatar = {
  id: string;
  name: string;
  scope: 'own' | 'public';
  style: string;
  language_tags: string[];
  thumbnail_url: string;
};

export type Template = {
  id: string;
  name: string;
  category: string;
  aspect_ratio: '9:16' | '16:9' | string;
  thumbnail_url: string;
};

export type ProjectAsset = {
  asset_id: string;
  project_id: string;
  kind: string;
  upload_url: string;
  public_url: string;
};

export type Video = {
  id: string;
  user_id: string;
  title: string | null;
  script: string;
  voice: string;
  aspect_ratio: '9:16' | '16:9' | '1:1' | string;
  resolution: '720p' | '1080p' | string;
  duration_mode: 'auto' | 'custom' | string;
  duration_seconds: number | null;
  captions_enabled: boolean;
  status: 'draft' | 'processing' | 'completed' | 'failed';
  progress: number;
  image_urls: string[];
  music_mode: 'none' | 'library' | 'upload' | string;
  music_track_id: string | null;
  music_file_url: string | null;
  music_volume: number;
  duck_music: boolean;
  thumbnail_url: string | null;
  output_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type MusicTrack = {
  id: string;
  name: string;
  duration_sec: number | null;
  preview_url: string;
};
