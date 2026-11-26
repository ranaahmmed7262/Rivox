import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
} from "react-native";

type Tab = "Chats" | "Calls" | "Contacts" | "Profile";

const accent = "#6C63FF";

function ActionButton({ label, onPress, secondary = false }: {
  label: string; onPress: () => void; secondary?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.actionButton, secondary && styles.secondaryButton]}
    >
      <Text style={[styles.actionText, secondary && styles.secondaryText]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("Chats");
  const [search, setSearch] = useState("");

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#090B18" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>RIVOX</Text>
          <Text style={styles.tagline}>Your Voice, Beyond Borders.</Text>
        </View>
        <View style={styles.avatar}><Text style={styles.avatarText}>R</Text></View>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>STAY CONNECTED</Text>
        <Text style={styles.heroTitle}>One world.{ "\n" }Closer together.</Text>
        <Text style={styles.heroBody}>Connect with the people who matter, wherever life takes you.</Text>
      </View>

      <View style={styles.tabs}>
        {(["Chats", "Calls", "Contacts", "Profile"] as Tab[]).map((item) => (
          <TouchableOpacity key={item} onPress={() => setTab(item)} style={styles.tab}>
            <Text style={[styles.tabText, tab === item && styles.activeTab]}>{item}</Text>
            {tab === item && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab === "Chats" && (
          <>
            <Text style={styles.sectionTitle}>Messages</Text>
            <Text style={styles.emptyTitle}>Your conversations start here</Text>
            <Text style={styles.emptyBody}>Find a RIVOX user in Contacts to get connected.</Text>
            <ActionButton label="Find people" onPress={() => setTab("Contacts")} />
          </>
        )}
        {tab === "Calls" && (
          <>
            <Text style={styles.sectionTitle}>Recent calls</Text>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No calls yet</Text>
              <Text style={styles.emptyBody}>Your audio and video call history will appear here.</Text>
            </View>
          </>
        )}
        {tab === "Contacts" && (
          <>
            <Text style={styles.sectionTitle}>Find people</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or RIVOX ID"
              placeholderTextColor="#777B91"
              autoCapitalize="none"
              style={styles.search}
            />
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Search will be available soon</Text>
              <Text style={styles.emptyBody}>Account registration and the user directory are the next setup steps.</Text>
            </View>
          </>
        )}
        {tab === "Profile" && (
          <>
            <Text style={styles.sectionTitle}>Your profile</Text>
            <View style={styles.profileCard}>
              <View style={styles.largeAvatar}><Text style={styles.largeAvatarText}>R</Text></View>
              <Text style={styles.profileName}>Welcome to RIVOX</Text>
              <Text style={styles.emptyBody}>Your profile details will appear here after sign up.</Text>
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>RIVOX • PRIVATE CONNECTIONS</Text>
        <Text style={styles.footerNote}>Early preview — calling and accounts are not active yet.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#090B18" },
  header: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { color: "#FFFFFF", fontSize: 25, fontWeight: "900", letterSpacing: 3 },
  tagline: { color: "#969BB5", fontSize: 11, marginTop: 3 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#242447", borderWidth: 1, borderColor: "#5F58D8", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#C8C4FF", fontSize: 18, fontWeight: "800" },
  hero: { marginHorizontal: 18, marginTop: 12, padding: 22, borderRadius: 24, backgroundColor: "#171832", borderWidth: 1, borderColor: "#29294E" },
  heroEyebrow: { color: "#9E98FF", fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  heroTitle: { color: "#FFFFFF", fontSize: 31, lineHeight: 37, fontWeight: "800", marginTop: 10 },
  heroBody: { color: "#B4B6CB", fontSize: 13, lineHeight: 20, marginTop: 10, maxWidth: 280 },
  tabs: { flexDirection: "row", justifyContent: "space-around", marginTop: 20, borderBottomWidth: 1, borderBottomColor: "#202238" },
  tab: { paddingVertical: 13, alignItems: "center", minWidth: 65 },
  tabText: { color: "#777B91", fontSize: 12, fontWeight: "700" },
  activeTab: { color: "#FFFFFF" },
  tabIndicator: { marginTop: 9, height: 3, width: 25, borderRadius: 3, backgroundColor: accent },
  content: { padding: 22, flexGrow: 1 },
  sectionTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", marginBottom: 18 },
  emptyCard: { backgroundColor: "#121529", borderRadius: 18, padding: 20, borderWidth: 1, borderColor: "#242842" },
  emptyTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", textAlign: "center", marginTop: 12 },
  emptyBody: { color: "#969BB5", fontSize: 12, lineHeight: 19, textAlign: "center", marginTop: 8 },
  actionButton: { backgroundColor: accent, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 13, alignItems: "center", marginTop: 20 },
  actionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  secondaryButton: { backgroundColor: "#242642", borderWidth: 1, borderColor: "#3A3D68" },
  secondaryText: { color: "#D7D5FF" },
  search: { backgroundColor: "#15182B", borderRadius: 13, paddingHorizontal: 15, paddingVertical: 14, color: "#FFFFFF", borderWidth: 1, borderColor: "#2A2E4A", marginBottom: 16 },
  profileCard: { alignItems: "center", padding: 24, backgroundColor: "#121529", borderRadius: 18 },
  largeAvatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: "#29264E", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#6C63FF" },
  largeAvatarText: { color: "#D5D1FF", fontSize: 30, fontWeight: "900" },
  profileName: { color: "#FFFFFF", fontSize: 17, fontWeight: "800", marginTop: 15 },
  footer: { paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#202238", alignItems: "center" },
  footerText: { color: "#777B91", fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  footerNote: { color: "#555B75", fontSize: 10, marginTop: 5 }
});