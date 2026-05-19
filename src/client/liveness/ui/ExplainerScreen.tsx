/**
 * @file Modality-aware explainer screen.
 *
 * Rendered before the camera ceremony when the user's registered
 * passkey biometric differs from face (or when modality is unknown).
 * Deliberately minimalist: a Modal + title + body + two buttons.
 * Consumers who need custom styling pass `explainerComponent` to
 * `verifyLiveness` instead.
 */

import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import type { RegisteredModality, ExplainerStrings } from "../../../types/liveness";
import { resolveExplainerStrings } from "./defaultStrings";

export interface ExplainerScreenProps {
  visible: boolean;
  modality: RegisteredModality;
  strings?: Partial<Record<RegisteredModality, ExplainerStrings>>;
  onContinue: () => void;
  onCancel: () => void;
  /** Style overrides applied to the centred card. */
  cardStyle?: ViewStyle;
}

export function ExplainerScreen({
  visible,
  modality,
  strings,
  onContinue,
  onCancel,
  cardStyle,
}: ExplainerScreenProps): React.ReactElement {
  const copy = resolveExplainerStrings(modality, strings);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, cardStyle]}>
          <Text accessibilityRole="header" style={styles.title}>
            {copy.title}
          </Text>
          <Text style={styles.body}>{copy.body}</Text>
          <View style={styles.buttonRow}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={[styles.button, styles.cancelButton]}
              testID="liveness-explainer-cancel"
            >
              <Text style={styles.cancelText}>{copy.cancelCta}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onContinue}
              style={[styles.button, styles.continueButton]}
              testID="liveness-explainer-continue"
            >
              <Text style={styles.continueText}>{copy.continueCta}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111",
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: "#333",
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 88,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "transparent",
  },
  cancelText: {
    color: "#444",
    fontSize: 15,
    fontWeight: "500",
  },
  continueButton: {
    backgroundColor: "#111",
  },
  continueText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});

export default ExplainerScreen;
