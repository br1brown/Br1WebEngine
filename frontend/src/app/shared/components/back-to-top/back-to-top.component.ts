import { ChangeDetectionStrategy, Component, computed, HostListener, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ThemeService } from '../../../core/services/theme.service';

/**
 * BackToTopComponent — Bottone "torna su" che appare durante lo scroll.
 *
 * Il bottone diventa visibile quando l'utente scorre la pagina oltre 300px.
 * Al click, la pagina torna all'inizio con un'animazione fluida (smooth scroll).
 *
 * L'aspetto del bottone puo' essere personalizzato passando una classe Bootstrap
 * tramite l'input [btnClass]. Se omesso, usa il colore del tema con contrasto automatico.
 */
@Component({
  selector: 'app-back-to-top',
  templateUrl: './back-to-top.component.html',
  styleUrl: './back-to-top.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BackToTopComponent {
  readonly theme = inject(ThemeService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly isVisible = signal(false);

  @HostListener('window:scroll')
  onScroll(): void {
    if (this.isBrowser)
      this.isVisible.set(window.scrollY > 300);
  }

  scrollToTop(): void {
    if (this.isBrowser)
      window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  readonly backgroundColor = computed(() => this.theme.colorPrimary());
  readonly borderColor = computed(() => ThemeService.mixHexColors(this.backgroundColor(), '#000000', 0.2));
  readonly textColor = computed(() => this.theme.colorPrimaryText());
}
