# App Store Build Guide for com.rkm.admin

## Prerequisites Checklist

- [ ] Apple Developer Account (enrolled in Apple Developer Program)
- [ ] Mac with Xcode installed (latest version recommended)
- [ ] App Store Connect account set up
- [ ] App created in App Store Connect with bundle ID: `com.rkm.admin`

## Step 1: Configure Certificates and Provisioning Profiles

### In Apple Developer Portal (developer.apple.com):

1. **Create Distribution Certificate:**
   - Go to Certificates, Identifiers & Profiles
   - Click "+" to create new certificate
   - Select "Apple Distribution"
   - Follow prompts to generate and download
   - Double-click to install in Keychain

2. **Register App ID:**
   - Go to Identifiers
   - Click "+" to register new App ID
   - Description: "RKM Admin"
   - Bundle ID: `com.rkm.admin` (Explicit)
   - Enable capabilities as needed (Push Notifications, etc.)

3. **Create App Store Provisioning Profile:**
   - Go to Profiles
   - Click "+" to create new profile
   - Select "App Store" distribution
   - Select your App ID (com.rkm.admin)
   - Select your Distribution Certificate
   - Download and double-click to install

## Step 2: Configure Xcode Project

1. **Open your project in Xcode**
   ```bash
   open ios/App/App.xcworkspace  # or .xcodeproj
   ```

2. **Update Project Settings:**
   - Select your project in the navigator
   - Select the "App" target
   - Go to "Signing & Capabilities" tab
   
3. **Configure Signing:**
   - Uncheck "Automatically manage signing"
   - Team: Select your Apple Developer Team
   - Provisioning Profile: Select the App Store profile you created
   - Signing Certificate: Apple Distribution

4. **Verify Bundle Identifier:**
   - Ensure Bundle Identifier is set to: `com.rkm.admin`

5. **Update Build Settings:**
   - Go to "Build Settings" tab
   - Search for "Bundle Identifier"
   - Set to: `com.rkm.admin`
   - Search for "Product Name"
   - Set to: `RKM Admin`

## Step 3: Prepare for App Store Submission

1. **Update Version and Build Number:**
   - In Info.plist or project settings:
   - CFBundleShortVersionString: `1.0` (version)
   - CFBundleVersion: `1` (build number)

2. **Add Required Assets:**
   - App Icon: Add all required sizes in Assets.xcassets
   - Launch Screen: Ensure LaunchScreen.storyboard is configured

3. **Review Info.plist:**
   - Add required usage descriptions for any permissions
   - Example: Camera, Photo Library, Location, etc.
   - Format: NSCameraUsageDescription, NSPhotoLibraryUsageDescription

4. **Test Your App:**
   - Run on a physical device
   - Test all functionality
   - Ensure no crashes or issues

## Step 4: Create Archive

1. **Select Device:**
   - In Xcode toolbar, select "Any iOS Device (arm64)"
   - Do NOT select a simulator

2. **Create Archive:**
   - Menu: Product > Archive
   - Wait for build to complete (this may take several minutes)
   - Xcode Organizer will open automatically

3. **In Xcode Organizer:**
   - You should see your archive listed
   - Select the archive
   - Click "Distribute App"

## Step 5: Upload to App Store Connect

1. **Distribution Method:**
   - Select "App Store Connect"
   - Click "Next"

2. **Destination:**
   - Select "Upload"
   - Click "Next"

3. **App Store Connect Options:**
   - Check "Upload your app's symbols" (recommended)
   - Check "Manage Version and Build Number" (optional)
   - Click "Next"

4. **Code Signing:**
   - Select "Automatically manage signing" or manually select
   - Click "Next"

5. **Review and Upload:**
   - Review the summary
   - Click "Upload"
   - Wait for upload to complete

## Step 6: Configure in App Store Connect

1. **Go to App Store Connect** (appstoreconnect.apple.com)

2. **Select Your App:**
   - Click "My Apps"
   - Click on "RKM Admin" (or create if not exists)

3. **App Information:**
   - Name: RKM Admin
   - Bundle ID: com.rkm.admin
   - Primary Language: English (or your preference)

4. **Pricing and Availability:**
   - Set price tier
   - Select countries/regions

5. **Prepare for Submission:**
   - Click "+" next to "iOS App" to create new version
   - Version: 1.0

6. **Fill Required Information:**
   - Screenshots (required for all device sizes)
   - App Description
   - Keywords
   - Support URL
   - Marketing URL (optional)
   - Privacy Policy URL

7. **Build Selection:**
   - Wait for your uploaded build to process (can take 10-60 minutes)
   - Once processed, select the build under "Build" section

8. **App Review Information:**
   - Contact information
   - Demo account (if login required)
   - Notes for reviewer

9. **Submit for Review:**
   - Click "Submit for Review"
   - Answer compliance questions
   - Confirm submission

## Step 7: Wait for Review

- Review typically takes 24-48 hours
- You'll receive email updates on status
- App can be: Approved, Rejected, or Require Additional Info

## Troubleshooting Common Issues

### Build Fails
- Check certificate expiration dates
- Ensure provisioning profile matches bundle ID
- Clean build folder: Product > Clean Build Folder

### Archive Option Greyed Out
- Must select "Any iOS Device" not a simulator
- Ensure scheme is set to "Release"

### Upload Fails
- Check your network connection
- Verify Apple Developer account is in good standing
- Ensure no compliance warnings in Xcode

### Missing Provisioning Profile
- Refresh profiles: Xcode > Preferences > Accounts > Download Manual Profiles
- Recreate provisioning profile in developer portal

### Code Signing Error
- Verify certificate is installed in Keychain
- Check team membership status
- Ensure App ID matches exactly

## Additional Commands (Optional)

### Command Line Build (Advanced):
```bash
# Clean
xcodebuild clean -workspace App.xcworkspace -scheme App

# Archive
xcodebuild archive \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -archivePath ./build/App.xcarchive

# Export IPA
xcodebuild -exportArchive \
  -archivePath ./build/App.xcarchive \
  -exportPath ./build \
  -exportOptionsPlist ExportOptions.plist
```

## Important Notes

1. **Bundle ID cannot be changed** after app is live
2. **First submission** takes longer (48-72 hours possible)
3. **Keep build numbers unique** - never reuse
4. **Version numbers** must increment with each submission
5. **Test thoroughly** before submission to avoid rejection

## App Store Review Guidelines

Make sure your app complies with:
- Apple's App Store Review Guidelines
- Human Interface Guidelines
- No crashes or bugs
- Complete and accurate metadata
- Proper content ratings

## Support

If you encounter issues:
- Apple Developer Forums: developer.apple.com/forums
- Apple Developer Support: developer.apple.com/contact
- Stack Overflow: stackoverflow.com (tag: ios, xcode)

---

**Bundle ID:** com.rkm.admin  
**App Name:** RKM Admin  
**Generated:** September 5, 2026
