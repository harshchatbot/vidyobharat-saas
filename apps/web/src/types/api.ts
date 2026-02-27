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
