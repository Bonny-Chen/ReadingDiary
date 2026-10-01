export interface AlertButton {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface AlertRequest {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

type Listener = (request: AlertRequest) => void;

let listener: Listener | null = null;

/** AlertHost 掛載時註冊，之後所有 Alert.alert 都轉給它顯示。 */
export function setAlertListener(next: Listener | null): void {
  listener = next;
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]): void {
    const request: AlertRequest = {
      title,
      message,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
    };
    if (listener) {
      listener(request);
      return;
    }
    // Host 還沒掛上時的保底
    window.alert(message ? `${title}\n${message}` : title);
  },
};
