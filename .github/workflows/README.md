# GitHub Actions APK Build & Upload

This workflow automatically builds the Android APK and uploads it to Supabase storage whenever you push changes to the `android-app/` directory.

## Setup Instructions

### 1. Add GitHub Secret

You need to add your Supabase Service Role Key as a GitHub secret:

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `SUPABASE_SERVICE_ROLE_KEY`
5. Value: Your Supabase service role key (found in Supabase Dashboard → Settings → API)
6. Click **Add secret**

### 2. How It Works

**Triggers:**
- Automatically runs when you push changes to `android-app/**`
- Can be manually triggered via the Actions tab

**Build Process:**
1. ✅ Checks out your code
2. ✅ Sets up JDK 17
3. ✅ Configures Android SDK (API 34)
4. ✅ Builds the APK using Gradle
5. ✅ Uploads APK to Supabase Storage (`apk-builds` bucket)
6. ✅ Updates the `apk_builds` database table
7. ✅ Marks new build as latest (sets previous builds to `is_latest = false`)

**Output:**
- APK is stored at: `https://tsjqvhddjfuecwxpcuil.supabase.co/storage/v1/object/public/apk-builds/iftin-delivery-v{VERSION}-{TIMESTAMP}.apk`
- Database record includes version, build number, file size, and GitHub commit SHA
- Artifact is uploaded to GitHub Actions (available for 30 days)

### 3. Version Management

The workflow automatically extracts version information from `android-app/app/build.gradle.kts`:
- `versionName` → APK version (e.g., "1.1")
- `versionCode` → Build number (e.g., 2)

To release a new version:
1. Update `versionCode` and `versionName` in `build.gradle.kts`
2. Commit and push changes
3. GitHub Actions will automatically build and upload

### 4. Monitoring

View build status:
- GitHub repo → **Actions** tab
- Each build shows detailed logs
- Success notification includes download link

### 5. Manual Trigger

To manually trigger a build:
1. Go to GitHub repo → **Actions** tab
2. Select "Build and Upload APK to Supabase" workflow
3. Click **Run workflow** → **Run workflow**

## Troubleshooting

**Build fails with "Permission denied" on gradlew:**
- The workflow includes `chmod +x` automatically

**Upload fails:**
- Verify `SUPABASE_SERVICE_ROLE_KEY` secret is set correctly
- Check that `apk-builds` bucket exists and is public

**Database update fails:**
- Verify the `apk_builds` table exists
- Check RLS policies allow inserts with service role key

## Security Notes

- ⚠️ Never commit the `SUPABASE_SERVICE_ROLE_KEY` directly in code
- ✅ Always use GitHub Secrets for sensitive data
- ✅ The service role key bypasses RLS policies (use carefully)
