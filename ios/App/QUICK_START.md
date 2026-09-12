# Quick Start: Build for App Store

## ⚡ Fast Track (If Everything is Set Up)

1. **Open Xcode**
   ```bash
   cd ios/App
   open App.xcworkspace
   ```

2. **Select Target Device**
   - Top toolbar: Select "Any iOS Device (arm64)"

3. **Archive**
   - Menu Bar: Product → Archive
   - Wait for completion

4. **Distribute**
   - Organizer opens automatically
   - Click "Distribute App"
   - Choose "App Store Connect"
   - Click "Upload"
   - Follow wizard

5. **Go to App Store Connect**
   - appstoreconnect.apple.com
   - Select your app
   - Wait for build processing
   - Select build and submit

---

## 📋 What You Need First Time

1. ✅ Apple Developer Account ($99/year)
2. ✅ Distribution Certificate installed
3. ✅ App Store Provisioning Profile
4. ✅ App created in App Store Connect
5. ✅ Bundle ID registered: `com.rkm.admin`

**Don't have these?** See full guide in `APP_STORE_BUILD_GUIDE.md`

---

## 🆘 If Build Fails

**"No matching provisioning profile"**
- Go to Apple Developer Portal
- Create App Store provisioning profile
- Download and install

**"Code signing error"**
- Check Signing & Capabilities tab
- Select correct team and profile

**"Archive option disabled"**
- Select "Any iOS Device" not simulator
- Edit Scheme → Run → Set to "Release"

---

## 📱 Required Before Submission

- [ ] App icon (all sizes in Assets.xcassets)
- [ ] Launch screen configured
- [ ] Screenshots for App Store
- [ ] App description and metadata
- [ ] Privacy policy URL
- [ ] Support URL

---

**Need detailed help?** Open `APP_STORE_BUILD_GUIDE.md`
