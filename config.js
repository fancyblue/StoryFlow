// Public runtime defaults only. User-specific Google credentials are loaded from
// the selected StoryFlow folder's settings.json so forks/clones can bring their own
// Google Cloud project without editing repository source files.
window.STORYFLOW_CONFIG = {
  googleClientId: null,
  googleProjectNumber: null,
  googleScopes: [
    "https://www.googleapis.com/auth/drive.file"
  ],
  googlePickerApiKey: null
};
