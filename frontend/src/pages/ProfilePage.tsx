import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../services/api.client';
import './ProfilePage.css';

interface ProfileData {
  firstName?: string;
  lastName?: string;
  learningInterests: string[];
  preferences: {
    learningPace: 'slow' | 'medium' | 'fast';
    preferredExamples: string[];
    difficultyLevel: number;
  };
}

export const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData>({
    firstName: '',
    lastName: '',
    learningInterests: [],
    preferences: {
      learningPace: 'medium',
      preferredExamples: [],
      difficultyLevel: 5
    }
  });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newInterest, setNewInterest] = useState('');

  useEffect(() => {
    loadProfile();
    loadSuggestions();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await apiClient.get('/profile');
      const userData = response.data.data;
      
      setProfile({
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        learningInterests: userData.learningInterests || [],
        preferences: userData.preferences || {
          learningPace: 'medium',
          preferredExamples: [],
          difficultyLevel: 5
        }
      });
    } catch (error) {
      console.error('Failed to load profile:', error);
      setMessage({ type: 'error', text: 'Failed to load profile data' });
    } finally {
      setIsLoading(false);
    }
  };

  const loadSuggestions = async () => {
    try {
      const response = await apiClient.get('/profile/interests/suggestions');
      setSuggestions(response.data.data);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      await apiClient.put('/profile', profile);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error: any) {
      console.error('Failed to save profile:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.message || 'Failed to save profile' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addInterest = (interest: string) => {
    if (interest && !profile.learningInterests.includes(interest)) {
      setProfile(prev => ({
        ...prev,
        learningInterests: [...prev.learningInterests, interest]
      }));
      setNewInterest('');
    }
  };

  const removeInterest = (interest: string) => {
    setProfile(prev => ({
      ...prev,
      learningInterests: prev.learningInterests.filter(i => i !== interest)
    }));
  };

  if (isLoading) {
    return (
      <div className="profile-page">
        <div className="loading-container">
          <div className="loading" />
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-container">
        <h1 className="profile-title">My Profile</h1>
        <p className="profile-subtitle">
          Complete your profile to get personalized learning recommendations
        </p>

        {message && (
          <div className={`message message--${message.type}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSave} className="profile-form">
          {/* Basic Information */}
          <section className="profile-section">
            <h2 className="section-title">Basic Information</h2>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="firstName" className="form-label">
                  First Name
                </label>
                <input
                  type="text"
                  id="firstName"
                  className="form-input"
                  value={profile.firstName}
                  onChange={(e) => setProfile(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="Enter your first name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="lastName" className="form-label">
                  Last Name
                </label>
                <input
                  type="text"
                  id="lastName"
                  className="form-input"
                  value={profile.lastName}
                  onChange={(e) => setProfile(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Enter your last name"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Account Information</label>
              <div className="account-info">
                <p><strong>Username:</strong> {user?.username}</p>
                <p><strong>Email:</strong> {user?.email}</p>
                <p><strong>Grade:</strong> {user?.grade}</p>
              </div>
            </div>
          </section>

          {/* Learning Interests */}
          <section className="profile-section">
            <h2 className="section-title">Learning Interests</h2>
            <p className="section-description">
              Select topics you're interested in learning about. This helps us personalize your experience.
            </p>

            <div className="interests-container">
              <div className="current-interests">
                <h3>Your Interests</h3>
                {profile.learningInterests.length === 0 ? (
                  <p className="no-interests">No interests selected yet</p>
                ) : (
                  <div className="interest-tags">
                    {profile.learningInterests.map((interest) => (
                      <span key={interest} className="interest-tag">
                        {interest}
                        <button
                          type="button"
                          onClick={() => removeInterest(interest)}
                          className="remove-interest"
                          aria-label={`Remove ${interest}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="add-interest">
                <h3>Add Interest</h3>
                <div className="add-interest-form">
                  <input
                    type="text"
                    value={newInterest}
                    onChange={(e) => setNewInterest(e.target.value)}
                    placeholder="Type a custom interest..."
                    className="form-input"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addInterest(newInterest);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => addInterest(newInterest)}
                    className="btn btn--secondary"
                    disabled={!newInterest.trim()}
                  >
                    Add
                  </button>
                </div>

                <div className="suggestions">
                  <h4>Suggested Topics</h4>
                  <div className="suggestion-tags">
                    {suggestions
                      .filter(s => !profile.learningInterests.includes(s))
                      .slice(0, 10)
                      .map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => addInterest(suggestion)}
                          className="suggestion-tag"
                        >
                          + {suggestion}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Learning Preferences */}
          <section className="profile-section">
            <h2 className="section-title">Learning Preferences</h2>

            <div className="form-group">
              <label htmlFor="learningPace" className="form-label">
                Learning Pace
              </label>
              <select
                id="learningPace"
                className="form-input"
                value={profile.preferences.learningPace}
                onChange={(e) => setProfile(prev => ({
                  ...prev,
                  preferences: {
                    ...prev.preferences,
                    learningPace: e.target.value as 'slow' | 'medium' | 'fast'
                  }
                }))}
              >
                <option value="slow">Slow - Take time to understand concepts deeply</option>
                <option value="medium">Medium - Balanced pace with good explanations</option>
                <option value="fast">Fast - Quick overviews and advanced concepts</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="difficultyLevel" className="form-label">
                Difficulty Level: {profile.preferences.difficultyLevel}/10
              </label>
              <input
                type="range"
                id="difficultyLevel"
                min="1"
                max="10"
                value={profile.preferences.difficultyLevel}
                onChange={(e) => setProfile(prev => ({
                  ...prev,
                  preferences: {
                    ...prev.preferences,
                    difficultyLevel: parseInt(e.target.value)
                  }
                }))}
                className="difficulty-slider"
              />
              <div className="difficulty-labels">
                <span>Beginner</span>
                <span>Advanced</span>
              </div>
            </div>
          </section>

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn--primary"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};